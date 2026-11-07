"""
Self-Improvement Evaluator — Phase 5 of AI OS.

The system evaluates its own past task outputs, scores quality,
identifies failure patterns, and generates improvement suggestions
that are stored back in Qdrant as meta-knowledge.

Cycle:
  fetch_recent_results → score_each → identify_patterns
  → generate_improvements → store_meta_knowledge → update_skill_levels
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

# Min score (0–100) for a task to be considered "successful"
SUCCESS_THRESHOLD = 65


@dataclass
class TaskEvaluation:
    task_id: str
    title: str
    agent: str
    score: float          # 0–100
    quality: str          # "excellent" | "good" | "poor" | "failed"
    strengths: list[str]
    weaknesses: list[str]
    improvement: str


@dataclass
class EvaluationReport:
    tasks_evaluated: int = 0
    avg_score: float = 0.0
    patterns: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    meta_knowledge_stored: int = 0
    skills_updated: int = 0


class SelfEvaluator:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        from langchain_anthropic import ChatAnthropic
        self._llm = ChatAnthropic(model=model, api_key=api_key, max_tokens=4096, temperature=0.3)

    # ── Score a single task output ────────────────────────────────────────────

    async def _evaluate_task(self, task: dict) -> TaskEvaluation | None:
        """Score a completed task output 0–100 and extract insights."""
        result = task.get("result") or {}
        output = result.get("output", "") if isinstance(result, dict) else ""
        if not output or len(output) < 50:
            return None

        title  = task.get("title", "")
        agent  = task.get("assigned_agent") or "general"
        desc   = task.get("description", "")

        from langchain_core.messages import HumanMessage, SystemMessage
        prompt = (
            f"Evaluate this AI task output:\n\n"
            f"**Task**: {title}\n"
            f"**Description**: {desc[:300]}\n"
            f"**Agent**: {agent}\n"
            f"**Output** (first 1500 chars):\n{output[:1500]}\n\n"
            "Evaluate strictly. Output JSON:\n"
            "{\n"
            '  "score": <0-100>,\n'
            '  "quality": "excellent"|"good"|"poor"|"failed",\n'
            '  "strengths": ["...", "..."],\n'
            '  "weaknesses": ["...", "..."],\n'
            '  "improvement": "<specific suggestion for next time>"\n'
            "}\n\n"
            "Score guide: 90+=excellent, 70-89=good, 40-69=poor, <40=failed.\n"
            "Be harsh — penalise vague, incomplete, or off-topic answers.\n"
            "Output only the JSON."
        )

        import json
        response = await self._llm.ainvoke([
            SystemMessage(content="You are a strict AI quality evaluator. Be objective and precise."),
            HumanMessage(content=prompt),
        ])
        raw = str(response.content).strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            data = json.loads(raw)
            return TaskEvaluation(
                task_id=str(task.get("id", "")),
                title=title,
                agent=agent,
                score=float(data.get("score", 50)),
                quality=data.get("quality", "poor"),
                strengths=data.get("strengths", []),
                weaknesses=data.get("weaknesses", []),
                improvement=data.get("improvement", ""),
            )
        except Exception as exc:
            log.warning("Failed to parse evaluation: %s", exc)
            return None

    # ── Pattern detection ─────────────────────────────────────────────────────

    async def _identify_patterns(self, evals: list[TaskEvaluation]) -> list[str]:
        """Find recurring failure patterns across all evaluations."""
        if not evals:
            return []

        weak_list = []
        for ev in evals:
            for w in ev.weaknesses:
                weak_list.append(f"[{ev.agent}] {w}")

        if not weak_list:
            return []

        from langchain_core.messages import HumanMessage
        prompt = (
            f"These are weaknesses from {len(evals)} AI task evaluations:\n\n"
            + "\n".join(f"- {w}" for w in weak_list[:30])
            + "\n\nIdentify 3-5 recurring patterns. Output a JSON array of strings.\n"
            "Each string: one concise pattern description. Output only the JSON array."
        )
        response = await self._llm.ainvoke([HumanMessage(content=prompt)])
        import json
        try:
            return json.loads(str(response.content).strip())[:5]
        except Exception:
            return []

    # ── Generate improvement suggestions ─────────────────────────────────────

    async def _generate_improvements(
        self,
        patterns: list[str],
        evals: list[TaskEvaluation],
    ) -> list[str]:
        """Generate actionable improvement suggestions for each pattern."""
        if not patterns:
            return []

        from langchain_core.messages import HumanMessage, SystemMessage
        best_outputs = [e for e in evals if e.score >= 80][:3]
        worst_outputs = [e for e in evals if e.score < SUCCESS_THRESHOLD][:3]

        prompt = (
            "AI OS Self-Improvement Analysis:\n\n"
            f"**Failure Patterns Identified:**\n"
            + "\n".join(f"- {p}" for p in patterns)
            + "\n\n"
            f"**Best Performing Tasks (score≥80):** "
            + ", ".join(e.title[:50] for e in best_outputs)
            + f"\n**Struggling Tasks (score<{SUCCESS_THRESHOLD}):** "
            + ", ".join(e.title[:50] for e in worst_outputs)
            + "\n\n"
            "Generate 3-5 specific, actionable improvement recommendations.\n"
            "These will be added to the AI's meta-knowledge base.\n"
            "Format as JSON array of strings. Be specific and technical. Output only the JSON."
        )
        response = await self._llm.ainvoke([
            SystemMessage(content="You are an AI systems architect improving an autonomous AI OS."),
            HumanMessage(content=prompt),
        ])
        import json
        try:
            return json.loads(str(response.content).strip())[:5]
        except Exception:
            return []

    # ── Main evaluation cycle ─────────────────────────────────────────────────

    async def run(self, memory_store=None, max_tasks: int = 20) -> EvaluationReport:
        from ..db.postgres import get_recent_tasks, update_skill_level, get_skill_gaps
        import json

        report = EvaluationReport()

        # Fetch recently completed tasks that have output
        completed = await get_recent_tasks(limit=max_tasks, status="completed")
        if not completed:
            log.info("Evaluator: no completed tasks to evaluate")
            return report

        log.info("Evaluator: evaluating %d completed tasks", len(completed))

        evals: list[TaskEvaluation] = []
        for task in completed:
            try:
                ev = await self._evaluate_task(task)
                if ev:
                    evals.append(ev)
                    log.info(
                        "Evaluator: %s [%s] score=%.0f (%s)",
                        ev.title[:40], ev.agent, ev.score, ev.quality,
                    )
            except Exception as exc:
                log.warning("Evaluation failed for %s: %s", task.get("id"), exc)

        if not evals:
            return report

        report.tasks_evaluated = len(evals)
        report.avg_score = sum(e.score for e in evals) / len(evals)

        # Identify patterns
        report.patterns = await self._identify_patterns(evals)
        report.improvements = await self._generate_improvements(report.patterns, evals)

        # Store meta-knowledge in Qdrant
        if memory_store:
            for improvement in report.improvements:
                try:
                    await memory_store.store(
                        content=improvement,
                        topic="self_improvement:recommendation",
                        source="evaluator",
                        avg_score=report.avg_score,
                        evaluated_count=report.tasks_evaluated,
                    )
                    report.meta_knowledge_stored += 1
                except Exception as exc:
                    log.warning("Failed to store improvement: %s", exc)

            # Store full evaluation summary
            summary = (
                f"Evaluation cycle: {report.tasks_evaluated} tasks, "
                f"avg score {report.avg_score:.0f}/100.\n"
                f"Patterns: {'; '.join(report.patterns[:3])}\n"
                f"Top improvement: {report.improvements[0] if report.improvements else 'N/A'}"
            )
            try:
                await memory_store.store(
                    content=summary,
                    topic="self_improvement:cycle_summary",
                    source="evaluator",
                )
                report.meta_knowledge_stored += 1
            except Exception:
                pass

        # Update skill levels based on agent performance
        agent_scores: dict[str, list[float]] = {}
        for ev in evals:
            agent_scores.setdefault(ev.agent, []).append(ev.score)

        for agent, scores in agent_scores.items():
            avg = sum(scores) / len(scores)
            skill_map = {
                "coding":   "Python",
                "research": "Research",
                "testing":  "Testing",
                "security": "Security Analysis",
                "content":  "Technical Writing",
            }
            skill_name = skill_map.get(agent)
            if skill_name:
                try:
                    current_gaps = await get_skill_gaps(threshold=100.0)
                    skill = next((s for s in current_gaps if s["name"] == skill_name), None)
                    if skill:
                        current = float(skill["level"])
                        # Gradual adjustment: move 10% toward the observed performance
                        new_level = current + (avg - current) * 0.1
                        await update_skill_level(skill_name, min(100.0, max(0.0, new_level)))
                        report.skills_updated += 1
                except Exception as exc:
                    log.warning("Skill update failed for %s: %s", skill_name, exc)

        log.info(
            "Evaluator: done — evaluated=%d avg=%.0f patterns=%d improvements=%d stored=%d",
            report.tasks_evaluated, report.avg_score, len(report.patterns),
            len(report.improvements), report.meta_knowledge_stored,
        )
        return report
