"""
Skill Acquisition Engine — detects knowledge gaps and learns autonomously.

Cycle:
  detect_gaps → prioritize → build_curriculum → execute_learning → assess → store → update_db

For each gap:
  1. Web search for official docs + GitHub examples
  2. AI synthesizes key concepts into structured notes
  3. Notes stored in Qdrant memory
  4. Skill level updated in PostgreSQL
  5. Self-assigned tasks created for practice projects
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

GAP_THRESHOLD = 70.0   # skills below this % need learning


@dataclass
class SkillGap:
    name: str
    category: str
    level: float
    target: float
    priority: int

    @property
    def gap_size(self) -> float:
        return self.target - self.level


@dataclass
class LearningCurriculum:
    skill: str
    topics: list[str]
    search_queries: list[str]
    practice_project: str


@dataclass
class LearningResult:
    skill: str
    new_level: float
    knowledge_stored: int   # number of Qdrant points created
    summary: str


class SkillEngine:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        from langchain_anthropic import ChatAnthropic
        self._llm = ChatAnthropic(model=model, api_key=api_key, max_tokens=4096, temperature=0.3)
        self._model = model

    # ── Gap Detection ─────────────────────────────────────────────────────────

    async def detect_gaps(self) -> list[SkillGap]:
        from ..db.postgres import get_skill_gaps
        rows = await get_skill_gaps(GAP_THRESHOLD)
        gaps = [
            SkillGap(
                name=r["name"],
                category=r["category"],
                level=float(r["level"]),
                target=float(r["target_level"]),
                priority=r["priority"],
            )
            for r in rows
        ]
        log.info("SkillEngine: %d gaps detected", len(gaps))
        return gaps

    def prioritize(self, gaps: list[SkillGap]) -> list[SkillGap]:
        return sorted(gaps, key=lambda g: g.gap_size * g.priority, reverse=True)

    # ── Curriculum Generation ─────────────────────────────────────────────────

    async def build_curriculum(self, skill: SkillGap) -> LearningCurriculum:
        from langchain_core.messages import HumanMessage

        prompt = (
            f"Create a focused learning curriculum for: {skill.name} ({skill.category})\n"
            f"Current level: {skill.level:.0f}% → Target: {skill.target:.0f}%\n\n"
            "Output JSON with exactly these keys:\n"
            '{\n'
            '  "topics": ["topic1", "topic2", ...],           // 5-8 key concepts to learn\n'
            '  "search_queries": ["query1", "query2", ...],   // 4-6 web search queries\n'
            '  "practice_project": "description of a mini-project to build"\n'
            '}\n\n'
            "Focus on the gap from current to target — skip basics if level > 30%.\n"
            "Output only the JSON."
        )
        response = await self._llm.ainvoke([HumanMessage(content=prompt)])
        import json

        raw = str(response.content).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        data = json.loads(raw)
        return LearningCurriculum(
            skill=skill.name,
            topics=data.get("topics", []),
            search_queries=data.get("search_queries", []),
            practice_project=data.get("practice_project", ""),
        )

    # ── Learning Execution ────────────────────────────────────────────────────

    async def execute_learning(
        self,
        gap: SkillGap,
        curriculum: LearningCurriculum,
        memory_store=None,
    ) -> LearningResult:
        """
        1. Search the web for each query
        2. Synthesize notes for each topic
        3. Store in Qdrant
        4. Estimate new skill level
        """
        from langchain_core.messages import HumanMessage, SystemMessage
        from ..core.tools.web_search import web_search

        stored = 0
        all_research: list[str] = []

        log.info("SkillEngine: learning %s — %d queries", gap.name, len(curriculum.search_queries))

        for query in curriculum.search_queries[:4]:     # limit to 4 searches
            try:
                results = web_search.invoke({"query": query})   # type: ignore[attr-defined]
                all_research.append(f"Query: {query}\n{results}")
            except Exception as exc:
                log.warning("Search failed: %s — %s", query, exc)

        if not all_research:
            return LearningResult(skill=gap.name, new_level=gap.level, knowledge_stored=0, summary="No data retrieved")

        # Synthesize findings into structured notes per topic
        for topic in curriculum.topics[:6]:
            synth_prompt = (
                f"Based on this research, write comprehensive notes about '{topic}' as part of learning {gap.name}.\n"
                f"Include: key concepts, syntax/API examples, common patterns, pitfalls.\n"
                f"Target audience: developer at {gap.level:.0f}% proficiency moving to {gap.target:.0f}%.\n\n"
                f"Research:\n{'---'.join(all_research[:2])}\n\n"
                "Write dense, practical notes (not a tutorial). Include code examples."
            )
            response = await self._llm.ainvoke([
                SystemMessage(content=f"You are a technical expert in {gap.name}. Write structured learning notes."),
                HumanMessage(content=synth_prompt),
            ])
            notes = str(response.content)

            if memory_store:
                try:
                    await memory_store.store(
                        content=notes,
                        topic=f"{gap.name}:{topic}",
                        source="skill_engine",
                        skill=gap.name,
                        topic_name=topic,
                    )
                    stored += 1
                except Exception as exc:
                    log.warning("Failed to store notes: %s", exc)

        # Estimate new level based on topics covered and research quality
        coverage = min(len(curriculum.topics), 6) / max(len(curriculum.topics), 1)
        level_gain = min(20.0, gap.gap_size * coverage * 0.6)
        new_level = min(gap.target, gap.level + level_gain)

        summary = (
            f"Learned {len(curriculum.topics)} topics for {gap.name}. "
            f"Level: {gap.level:.0f}% → {new_level:.0f}%. "
            f"Stored {stored} knowledge items."
        )
        log.info("SkillEngine: %s", summary)
        return LearningResult(skill=gap.name, new_level=new_level, knowledge_stored=stored, summary=summary)

    # ── Self-Assigned Practice Tasks ──────────────────────────────────────────

    async def create_practice_task(self, curriculum: LearningCurriculum) -> str | None:
        """Create a coding practice task in PostgreSQL to reinforce the learned skill."""
        if not curriculum.practice_project:
            return None
        try:
            from ..db.postgres import create_task
            task_id = await create_task(
                title=f"Practice: {curriculum.skill} — {curriculum.practice_project[:60]}",
                description=(
                    f"Build a mini-project to reinforce {curriculum.skill} skills.\n\n"
                    f"Project: {curriculum.practice_project}\n\n"
                    f"Topics to apply: {', '.join(curriculum.topics[:5])}"
                ),
                origin="learning_engine",
                assigned_agent="coding",
                priority=4,
                metadata={"skill": curriculum.skill, "type": "practice"},
            )
            log.info("SkillEngine: practice task created → %s", task_id)
            return task_id
        except Exception as exc:
            log.warning("Failed to create practice task: %s", exc)
            return None

    # ── Full Learning Cycle ───────────────────────────────────────────────────

    async def run_cycle(self, memory_store=None, max_skills: int = 3) -> list[LearningResult]:
        """Run a full learning cycle for the top N skill gaps."""
        gaps = await self.detect_gaps()
        if not gaps:
            log.info("SkillEngine: no gaps found — all skills at target level")
            return []

        prioritized = self.prioritize(gaps)[:max_skills]
        results: list[LearningResult] = []

        for gap in prioritized:
            log.info("SkillEngine: starting learning cycle for %s (%.0f%%→%.0f%%)", gap.name, gap.level, gap.target)
            try:
                curriculum = await self.build_curriculum(gap)
                result = await self.execute_learning(gap, curriculum, memory_store)
                await create_practice_task_safe(self, curriculum)

                from ..db.postgres import update_skill_level
                await update_skill_level(gap.name, result.new_level)

                results.append(result)
            except Exception as exc:
                log.error("Learning cycle failed for %s: %s", gap.name, exc)

        return results


async def create_practice_task_safe(engine: SkillEngine, curriculum: LearningCurriculum) -> None:
    try:
        await engine.create_practice_task(curriculum)
    except Exception as exc:
        log.warning("create_practice_task_safe: %s", exc)
