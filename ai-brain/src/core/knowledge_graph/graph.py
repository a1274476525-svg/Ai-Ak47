"""
Knowledge Graph — Neo4j integration for long-term structured memory.

Node types:
  Concept     — abstract idea, technology, topic
  Entity      — concrete thing: person, project, library, tool
  Task        — a task that was executed
  Skill       — a tracked skill with level
  Insight     — a derived observation or lesson learned

Relationship types:
  RELATES_TO        — general semantic connection
  DEPENDS_ON        — A depends on B to work
  USED_IN           — tool/concept used in project/task
  LEARNED_FROM      — insight extracted from task/research
  IMPROVES          — skill/insight improves another skill
  AUTHORED_BY       — entity created/written by another entity
  CONTRADICTS       — two concepts or facts contradict each other
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger(__name__)


class KnowledgeGraph:
    """
    Async wrapper around the Neo4j driver.
    Falls back to no-op mode when Neo4j is unavailable so the rest of the
    system keeps running without a graph database.
    """

    def __init__(self, uri: str, user: str, password: str) -> None:
        self._uri      = uri
        self._user     = user
        self._password = password
        self._driver: Any = None
        self._available = False

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def init(self) -> None:
        try:
            from neo4j import AsyncGraphDatabase
            self._driver = AsyncGraphDatabase.driver(
                self._uri,
                auth=(self._user, self._password),
                connection_timeout=5,
            )
            await self._driver.verify_connectivity()
            await self._setup_constraints()
            self._available = True
            log.info("Knowledge Graph (Neo4j) connected at %s", self._uri)
        except ImportError:
            log.warning("neo4j package not installed — Knowledge Graph disabled")
        except Exception as exc:
            log.warning("Neo4j unavailable (%s) — Knowledge Graph disabled", exc)

    async def close(self) -> None:
        if self._driver:
            await self._driver.close()

    @property
    def available(self) -> bool:
        return self._available

    # ── Schema setup ─────────────────────────────────────────────────────────

    async def _setup_constraints(self) -> None:
        stmts = [
            "CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (n:Concept) REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT entity_name  IF NOT EXISTS FOR (n:Entity)  REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT skill_name   IF NOT EXISTS FOR (n:Skill)   REQUIRE n.name IS UNIQUE",
            "CREATE CONSTRAINT task_id      IF NOT EXISTS FOR (n:Task)    REQUIRE n.task_id IS UNIQUE",
        ]
        async with self._driver.session() as session:
            for stmt in stmts:
                try:
                    await session.run(stmt)
                except Exception:
                    pass  # constraint may already exist

    # ── Write operations ─────────────────────────────────────────────────────

    async def upsert_concept(
        self,
        name: str,
        category: str = "general",
        description: str = "",
        source: str = "",
        tags: list[str] | None = None,
    ) -> bool:
        if not self._available:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (c:Concept {name: $name})
                SET c.category    = $category,
                    c.description = $description,
                    c.source      = $source,
                    c.tags        = $tags,
                    c.updated_at  = datetime()
                """,
                name=name, category=category, description=description,
                source=source, tags=tags or [],
            )
        return True

    async def upsert_entity(
        self,
        name: str,
        entity_type: str,
        description: str = "",
        url: str = "",
        metadata: dict | None = None,
    ) -> bool:
        if not self._available:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (e:Entity {name: $name})
                SET e.type        = $entity_type,
                    e.description = $description,
                    e.url         = $url,
                    e.metadata    = $metadata,
                    e.updated_at  = datetime()
                """,
                name=name, entity_type=entity_type, description=description,
                url=url, metadata=str(metadata or {}),
            )
        return True

    async def upsert_skill(
        self,
        name: str,
        category: str,
        level: float,
        target_level: float = 80.0,
    ) -> bool:
        if not self._available:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (s:Skill {name: $name})
                SET s.category     = $category,
                    s.level        = $level,
                    s.target_level = $target_level,
                    s.updated_at   = datetime()
                """,
                name=name, category=category, level=level, target_level=target_level,
            )
        return True

    async def add_task_node(
        self,
        task_id: str,
        title: str,
        agent: str,
        status: str,
        concepts: list[str] | None = None,
    ) -> bool:
        if not self._available:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MERGE (t:Task {task_id: $task_id})
                SET t.title      = $title,
                    t.agent      = $agent,
                    t.status     = $status,
                    t.updated_at = datetime()
                """,
                task_id=task_id, title=title, agent=agent, status=status,
            )
            for concept_name in (concepts or []):
                await session.run(
                    """
                    MATCH (t:Task {task_id: $task_id})
                    MERGE (c:Concept {name: $concept_name})
                    MERGE (t)-[:RELATES_TO]->(c)
                    """,
                    task_id=task_id, concept_name=concept_name,
                )
        return True

    async def add_insight(
        self,
        insight: str,
        source_task_id: str | None = None,
        related_skills: list[str] | None = None,
        confidence: float = 0.7,
    ) -> bool:
        if not self._available:
            return False
        async with self._driver.session() as session:
            result = await session.run(
                """
                CREATE (i:Insight {
                  text:       $insight,
                  confidence: $confidence,
                  created_at: datetime()
                })
                RETURN elementId(i) AS id
                """,
                insight=insight, confidence=confidence,
            )
            record = await result.single()
            if not record:
                return False
            node_id = record["id"]

            if source_task_id:
                await session.run(
                    """
                    MATCH (i:Insight) WHERE elementId(i) = $node_id
                    MATCH (t:Task {task_id: $task_id})
                    MERGE (i)-[:LEARNED_FROM]->(t)
                    """,
                    node_id=node_id, task_id=source_task_id,
                )
            for skill_name in (related_skills or []):
                await session.run(
                    """
                    MATCH (i:Insight) WHERE elementId(i) = $node_id
                    MERGE (s:Skill {name: $skill_name})
                    MERGE (i)-[:IMPROVES]->(s)
                    """,
                    node_id=node_id, skill_name=skill_name,
                )
        return True

    async def add_relationship(
        self,
        from_label: str,
        from_name: str,
        rel_type: str,
        to_label: str,
        to_name: str,
        properties: dict | None = None,
    ) -> bool:
        if not self._available:
            return False
        prop_str = ", ".join(f"r.{k} = ${k}" for k in (properties or {}))
        set_clause = f"SET {prop_str}" if prop_str else ""
        query = f"""
            MERGE (a:{from_label} {{name: $from_name}})
            MERGE (b:{to_label}   {{name: $to_name}})
            MERGE (a)-[r:{rel_type}]->(b)
            {set_clause}
        """
        params = {"from_name": from_name, "to_name": to_name, **(properties or {})}
        async with self._driver.session() as session:
            await session.run(query, **params)
        return True

    # ── Read operations ───────────────────────────────────────────────────────

    async def search_concepts(self, keyword: str, limit: int = 10) -> list[dict]:
        if not self._available:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (c:Concept)
                WHERE toLower(c.name) CONTAINS toLower($keyword)
                   OR toLower(c.description) CONTAINS toLower($keyword)
                RETURN c.name AS name, c.category AS category,
                       c.description AS description, c.tags AS tags
                LIMIT $limit
                """,
                keyword=keyword, limit=limit,
            )
            return [dict(r) async for r in result]

    async def get_related(
        self,
        name: str,
        label: str = "Concept",
        depth: int = 2,
        limit: int = 20,
    ) -> list[dict]:
        if not self._available:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                f"""
                MATCH path = (start:{label} {{name: $name}})-[*1..{depth}]-(related)
                UNWIND nodes(path) AS n
                RETURN DISTINCT
                    labels(n)[0] AS label,
                    coalesce(n.name, n.text, n.title, '') AS name,
                    coalesce(n.description, n.category, '') AS description
                LIMIT $limit
                """,
                name=name, limit=limit,
            )
            return [dict(r) async for r in result]

    async def get_stats(self) -> dict:
        if not self._available:
            return {"available": False}
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count
                """
            )
            counts = {}
            async for r in result:
                counts[r["label"]] = r["count"]

            result2 = await session.run("MATCH ()-[r]->() RETURN count(r) AS total")
            rel_total = 0
            async for r in result2:
                rel_total = r["total"]

        return {
            "available": True,
            "nodes": counts,
            "relationships": rel_total,
        }

    async def get_skill_graph(self) -> list[dict]:
        if not self._available:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Skill)
                OPTIONAL MATCH (s)-[r]->(other)
                RETURN s.name AS skill, s.level AS level, s.category AS category,
                       type(r) AS rel_type, other.name AS related_to
                ORDER BY s.level DESC
                LIMIT 50
                """
            )
            return [dict(r) async for r in result]
