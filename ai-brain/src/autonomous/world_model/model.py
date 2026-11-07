"""
World Model — persistent, structured representation of everything the AI OS knows.

The World Model accumulates knowledge from:
  - Task results (what was built, what worked, what failed)
  - Research pipeline (new technologies, papers, repos)
  - Skill learning cycles (what the system has mastered)
  - Self-evaluation (patterns and failure modes)
  - User interactions (preferences, common requests)

Storage:
  - Qdrant: semantic similarity search over all facts
  - Neo4j:  structural relationships between entities
  - PostgreSQL: structured metadata and statistics

This is the "long-term brain" of the system — it accumulates over months
and enables the AI OS to reason about its own capabilities and the world.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

log = logging.getLogger(__name__)


@dataclass
class WorldFact:
    """A single piece of knowledge stored in the World Model."""
    content: str
    source: str               # task_result | research | skill | evaluation | user
    category: str             # technology | pattern | insight | limitation | preference
    confidence: float = 0.8   # 0.0 - 1.0
    tags: list[str] = field(default_factory=list)
    related_entities: list[str] = field(default_factory=list)
    task_id: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class WorldModelStats:
    total_facts: int = 0
    facts_by_source: dict[str, int] = field(default_factory=dict)
    facts_by_category: dict[str, int] = field(default_factory=dict)
    knowledge_graph_nodes: int = 0
    knowledge_graph_edges: int = 0
    last_updated: str = ""


class WorldModel:
    """
    Manages the AI OS world model — accumulates and retrieves structured knowledge.
    Wraps both Qdrant (semantic) and Neo4j (graph) to provide a unified API.
    """

    def __init__(
        self,
        memory_store=None,       # MemoryStore (Qdrant)
        knowledge_graph=None,    # KnowledgeGraph (Neo4j)
        api_key: str = "",
        model: str = "claude-sonnet-4-6",
    ) -> None:
        self._memory  = memory_store
        self._graph   = knowledge_graph
        self._api_key = api_key
        self._model   = model

    # ── Core write operations ─────────────────────────────────────────────────

    async def observe(self, fact: WorldFact) -> bool:
        """Store a new fact in both Qdrant and Neo4j."""
        stored = False

        # Store in Qdrant for semantic search
        if self._memory:
            try:
                topic = f"world_model:{fact.source}:{fact.category}"
                await self._memory.store(
                    content=fact.content,
                    topic=topic,
                    source=fact.source,
                    task_id=fact.task_id,
                    metadata={
                        "category": fact.category,
                        "confidence": fact.confidence,
                        "tags": fact.tags,
                        "related_entities": fact.related_entities,
                        "created_at": fact.created_at,
                    },
                )
                stored = True
            except Exception as exc:
                log.warning("WorldModel: Qdrant store failed: %s", exc)

        # Add concept nodes and relationships to Neo4j
        if self._graph and self._graph.available:
            try:
                # Main concept
                await self._graph.upsert_concept(
                    name=fact.content[:100],
                    category=fact.category,
                    description=fact.content,
                    source=fact.source,
                    tags=fact.tags,
                )
                # Link related entities
                for entity in fact.related_entities:
                    await self._graph.add_relationship(
                        from_label="Concept",
                        from_name=fact.content[:100],
                        rel_type="RELATES_TO",
                        to_label="Concept",
                        to_name=entity,
                    )
                stored = True
            except Exception as exc:
                log.warning("WorldModel: Neo4j store failed: %s", exc)

        return stored

    async def learn_from_task(
        self,
        task_id: str,
        title: str,
        agent: str,
        output: str,
        success: bool,
    ) -> int:
        """Extract and store knowledge from a completed task."""
        if not self._api_key:
            return 0

        facts_stored = 0
        try:
            # Use Claude to extract key learnings from task output
            from langchain_anthropic import ChatAnthropic
            from langchain_core.messages import HumanMessage, SystemMessage

            llm = ChatAnthropic(model=self._model, api_key=self._api_key, max_tokens=1024)

            extract_prompt = (
                f"Task: {title}\nAgent: {agent}\nSuccess: {success}\n\n"
                f"Output (first 2000 chars):\n{output[:2000]}\n\n"
                "Extract 1-3 reusable facts or patterns from this task result.\n"
                "Format as JSON array:\n"
                '[{"content": "...", "category": "technology|pattern|insight|limitation", '
                '"tags": [...], "related_entities": [...], "confidence": 0.0-1.0}]\n\n'
                "Only return JSON. No explanation."
            )

            response = await llm.ainvoke([
                SystemMessage(content="You are a knowledge extraction system. Extract structured facts from task results."),
                HumanMessage(content=extract_prompt),
            ])

            raw = str(response.content).strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

            facts_data = json.loads(raw)
            for fd in facts_data:
                fact = WorldFact(
                    content=fd.get("content", ""),
                    source="task_result",
                    category=fd.get("category", "insight"),
                    confidence=fd.get("confidence", 0.7),
                    tags=fd.get("tags", []),
                    related_entities=fd.get("related_entities", []),
                    task_id=task_id,
                )
                if await self.observe(fact):
                    facts_stored += 1

        except Exception as exc:
            log.warning("WorldModel: learn_from_task failed: %s", exc)

        return facts_stored

    async def learn_from_research(
        self,
        topic: str,
        summary: str,
        source_url: str = "",
        tags: list[str] | None = None,
    ) -> bool:
        return await self.observe(WorldFact(
            content=f"{topic}: {summary}",
            source="research",
            category="technology",
            confidence=0.75,
            tags=tags or [],
            related_entities=[topic],
        ))

    async def learn_from_insight(
        self,
        insight: str,
        skill: str,
        confidence: float = 0.8,
    ) -> bool:
        ok = await self.observe(WorldFact(
            content=insight,
            source="evaluation",
            category="insight",
            confidence=confidence,
            related_entities=[skill],
        ))
        if self._graph and self._graph.available:
            await self._graph.add_insight(
                insight=insight,
                related_skills=[skill],
                confidence=confidence,
            )
        return ok

    # ── Query operations ──────────────────────────────────────────────────────

    async def recall(self, query: str, limit: int = 10) -> list[dict]:
        """Semantic search over the world model."""
        if not self._memory:
            return []
        try:
            results = await self._memory.search(query=query, limit=limit)
            return [
                {"content": r.content, "score": r.score, "source": r.source}
                for r in results
            ]
        except Exception as exc:
            log.warning("WorldModel: recall failed: %s", exc)
            return []

    async def explore_concept(self, concept: str) -> dict:
        """Get everything known about a concept from both Qdrant and Neo4j."""
        semantic_results = await self.recall(concept, limit=5)
        graph_results: list[dict] = []

        if self._graph and self._graph.available:
            graph_results = await self._graph.get_related(concept, depth=2, limit=15)

        return {
            "concept": concept,
            "semantic_matches": semantic_results,
            "graph_relations": graph_results,
        }

    async def get_stats(self) -> WorldModelStats:
        stats = WorldModelStats(last_updated=datetime.now(timezone.utc).isoformat())

        if self._graph and self._graph.available:
            graph_stats = await self._graph.get_stats()
            nodes = graph_stats.get("nodes", {})
            stats.knowledge_graph_nodes = sum(nodes.values())
            stats.knowledge_graph_edges = graph_stats.get("relationships", 0)

        return stats

    # ── Consolidation ─────────────────────────────────────────────────────────

    async def consolidate(self, max_items: int = 50) -> dict:
        """
        Periodic consolidation — finds related facts and merges/strengthens them.
        Runs during off-peak hours via scheduler.
        """
        if not self._api_key or not self._memory:
            return {"consolidated": 0}

        log.info("WorldModel: starting consolidation (max=%d)", max_items)
        consolidated = 0

        try:
            # Find recent insights and strengthen their Neo4j connections
            recent = await self.recall("AI OS task result insight pattern", limit=max_items)
            for item in recent[:10]:
                content = item.get("content", "")
                if content and self._graph and self._graph.available:
                    # Add as a concept to the graph
                    await self._graph.upsert_concept(
                        name=content[:80],
                        category="insight",
                        description=content,
                        source="consolidation",
                    )
                    consolidated += 1
        except Exception as exc:
            log.warning("WorldModel: consolidation error: %s", exc)

        log.info("WorldModel: consolidation done — %d items processed", consolidated)
        return {"consolidated": consolidated}
