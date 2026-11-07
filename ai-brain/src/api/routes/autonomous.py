"""
Autonomous Brain REST API

Endpoints:
  POST /v1/autonomous/plan          — decompose a goal into tasks
  GET  /v1/autonomous/skills        — list all skills + levels
  GET  /v1/autonomous/skills/gaps   — skills below target level
  POST /v1/autonomous/skills/learn  — trigger a learning cycle
  POST /v1/autonomous/research/run  — trigger the research pipeline immediately
  GET  /v1/autonomous/tasks/pending — list pending autonomous tasks
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)
router = APIRouter(prefix="/autonomous", tags=["autonomous"])


# ─────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────

class PlanRequest(BaseModel):
    goal: str = Field(..., min_length=5, max_length=2000)
    store: bool = Field(default=True, description="Persist tasks to PostgreSQL")


class PlanResponse(BaseModel):
    goal: str
    breakdown: str
    estimated_total_minutes: int
    tasks: list[dict]
    task_ids: list[str] = []


class LearnRequest(BaseModel):
    max_skills: int = Field(default=3, ge=1, le=10)


class LearnResponse(BaseModel):
    results: list[dict]


class ResearchResponse(BaseModel):
    repos_found: int
    hn_stories_found: int
    papers_found: int
    knowledge_stored: int
    tasks_created: int
    errors: list[str]
    synthesis_preview: str


class ExecutorResponse(BaseModel):
    processed: int
    succeeded: int
    failed: int
    skipped: int
    results: list[dict]


class EvaluatorResponse(BaseModel):
    tasks_evaluated: int
    avg_score: float
    patterns: list[str]
    improvements: list[str]
    meta_knowledge_stored: int
    skills_updated: int


# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────

def _get_settings():
    from ...config import get_settings
    return get_settings()


def _get_memory():
    from ..deps import get_memory_store
    return get_memory_store()


# ─────────────────────────────────────────
# Routes
# ─────────────────────────────────────────

@router.post("/plan", response_model=PlanResponse)
async def plan_goal(body: PlanRequest):
    """Decompose a high-level goal into ordered, dependency-aware sub-tasks."""
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    from ...core.budget import check_budget
    await check_budget()

    from ...autonomous.planner import Planner
    planner = Planner(api_key=settings.anthropic_api_key)

    try:
        if body.store and settings.database_url:
            plan, task_ids = await planner.plan_and_store(body.goal)
        else:
            plan = await planner.plan(body.goal)
            task_ids = []

        return PlanResponse(
            goal=plan.goal,
            breakdown=plan.breakdown,
            estimated_total_minutes=plan.estimated_total_minutes,
            tasks=[
                {
                    "index": t.index,
                    "title": t.title,
                    "description": t.description,
                    "agent": t.agent,
                    "priority": t.priority,
                    "depends_on": t.depends_on,
                    "estimated_minutes": t.estimated_minutes,
                }
                for t in plan.tasks
            ],
            task_ids=task_ids,
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Plan error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/skills")
async def list_skills() -> list[dict]:
    """List all skills with current levels."""
    try:
        from ...db.postgres import get_all_skills
        return await get_all_skills()
    except Exception as exc:
        log.error("list_skills: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.get("/skills/gaps")
async def list_skill_gaps(threshold: float = 70.0) -> list[dict]:
    """Skills below the target threshold."""
    try:
        from ...db.postgres import get_skill_gaps
        return await get_skill_gaps(threshold)
    except Exception as exc:
        log.error("list_skill_gaps: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.post("/skills/learn", response_model=LearnResponse)
async def trigger_learning(body: LearnRequest):
    """Trigger an immediate skill learning cycle (runs in foreground)."""
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    memory = _get_memory()

    from ...core.budget import check_budget
    await check_budget()

    from ...autonomous.skill_engine import SkillEngine
    engine = SkillEngine(api_key=settings.anthropic_api_key)

    try:
        results = await engine.run_cycle(memory_store=memory, max_skills=body.max_skills)
        return LearnResponse(
            results=[
                {
                    "skill": r.skill,
                    "new_level": r.new_level,
                    "knowledge_stored": r.knowledge_stored,
                    "summary": r.summary,
                }
                for r in results
            ]
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("trigger_learning: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/research/run", response_model=ResearchResponse)
async def trigger_research():
    """Trigger the daily research pipeline immediately (GitHub + HN + ArXiv)."""
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    memory = _get_memory()

    from ...core.budget import check_budget
    await check_budget()

    from ...autonomous.researcher import ResearchPipeline
    pipeline = ResearchPipeline(api_key=settings.anthropic_api_key)

    try:
        report = await pipeline.run(memory_store=memory)
        return ResearchResponse(
            repos_found=len(report.repos),
            hn_stories_found=len(report.hn_stories),
            papers_found=len(report.papers),
            knowledge_stored=report.knowledge_stored,
            tasks_created=report.tasks_created,
            errors=report.errors,
            synthesis_preview=report.synthesis[:500] if report.synthesis else "",
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("trigger_research: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tasks/{task_id}/steps")
async def get_task_step_trace(task_id: str) -> list[dict]:
    """Step-by-step trace log for a task (e.g. each Coding Brain sub-agent)."""
    try:
        from ...db.postgres import get_task_steps
        return await get_task_steps(task_id)
    except Exception as exc:
        log.error("get_task_step_trace: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.get("/tasks/pending")
async def get_pending_tasks(limit: int = 20) -> list[dict]:
    """List pending autonomous tasks from PostgreSQL."""
    try:
        from ...db.postgres import get_pending_tasks
        return await get_pending_tasks(limit=limit)
    except Exception as exc:
        log.error("get_pending_tasks: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.get("/tasks/recent")
async def get_recent_tasks(limit: int = 20, status: str | None = None) -> list[dict]:
    """Recent tasks (all statuses or filtered)."""
    try:
        from ...db.postgres import get_recent_tasks
        return await get_recent_tasks(limit=limit, status=status)
    except Exception as exc:
        log.error("get_recent_tasks: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.get("/tasks/{task_id}")
async def get_task(task_id: str) -> dict:
    """Get a single task by ID."""
    try:
        from ...db.postgres import get_task_by_id
        task = await get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
    except HTTPException:
        raise
    except Exception as exc:
        log.error("get_task: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")


@router.post("/tasks/execute", response_model=ExecutorResponse)
async def trigger_executor(max_tasks: int = 3):
    """Trigger immediate task execution (runs pending tasks now)."""
    from ..deps import get_agent_registry
    agents = get_agent_registry()
    memory = _get_memory()

    from ...autonomous.executor import TaskExecutor
    executor = TaskExecutor(agent_registry=agents, memory_store=memory)

    try:
        report = await executor.run(max_tasks=max_tasks)
        return ExecutorResponse(
            processed=report.processed,
            succeeded=report.succeeded,
            failed=report.failed,
            skipped=report.skipped,
            results=[
                {
                    "task_id": r.task_id,
                    "title": r.title,
                    "success": r.success,
                    "agent": r.agent,
                    "duration_ms": r.duration_ms,
                    "output": r.output[:300] if r.output else "",
                    "error": r.error,
                }
                for r in report.results
            ],
        )
    except Exception as exc:
        log.error("trigger_executor: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/evaluate", response_model=EvaluatorResponse)
async def trigger_evaluation(max_tasks: int = 20):
    """Trigger self-evaluation: score recent task outputs and generate improvements."""
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    memory = _get_memory()

    from ...core.budget import check_budget
    await check_budget()

    from ...autonomous.evaluator import SelfEvaluator
    evaluator = SelfEvaluator(api_key=settings.anthropic_api_key)

    try:
        report = await evaluator.run(memory_store=memory, max_tasks=max_tasks)
        return EvaluatorResponse(
            tasks_evaluated=report.tasks_evaluated,
            avg_score=report.avg_score,
            patterns=report.patterns,
            improvements=report.improvements,
            meta_knowledge_stored=report.meta_knowledge_stored,
            skills_updated=report.skills_updated,
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("trigger_evaluation: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────
# World Model
# ─────────────────────────────────────────

class WorldModelRecallRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    limit: int = Field(default=10, ge=1, le=50)


class WorldModelLearnRequest(BaseModel):
    topic: str
    summary: str
    source_url: str = ""
    tags: list[str] = []


@router.get("/world-model/stats")
async def world_model_stats():
    """Get World Model statistics."""
    settings = _get_settings()
    from ..deps import get_memory_store, get_knowledge_graph
    from ...autonomous.world_model import WorldModel
    memory = get_memory_store()
    kg = get_knowledge_graph()
    wm = WorldModel(memory_store=memory, knowledge_graph=kg, api_key=settings.anthropic_api_key)
    stats = await wm.get_stats()
    return {
        "total_facts": stats.total_facts,
        "knowledge_graph_nodes": stats.knowledge_graph_nodes,
        "knowledge_graph_edges": stats.knowledge_graph_edges,
        "last_updated": stats.last_updated,
    }


@router.post("/world-model/recall")
async def world_model_recall(body: WorldModelRecallRequest):
    """Semantic search over the World Model."""
    from ..deps import get_memory_store, get_knowledge_graph
    from ...autonomous.world_model import WorldModel
    memory = get_memory_store()
    kg = get_knowledge_graph()
    wm = WorldModel(memory_store=memory, knowledge_graph=kg)
    return await wm.recall(query=body.query, limit=body.limit)


@router.post("/world-model/learn")
async def world_model_learn(body: WorldModelLearnRequest):
    """Manually add a research fact to the World Model."""
    settings = _get_settings()
    from ..deps import get_memory_store, get_knowledge_graph
    from ...autonomous.world_model import WorldModel
    memory = get_memory_store()
    kg = get_knowledge_graph()
    wm = WorldModel(memory_store=memory, knowledge_graph=kg, api_key=settings.anthropic_api_key)
    ok = await wm.learn_from_research(
        topic=body.topic,
        summary=body.summary,
        source_url=body.source_url,
        tags=body.tags,
    )
    return {"ok": ok}


@router.post("/world-model/consolidate")
async def world_model_consolidate(max_items: int = 50):
    """Trigger World Model consolidation (merges related facts)."""
    settings = _get_settings()
    from ..deps import get_memory_store, get_knowledge_graph
    from ...autonomous.world_model import WorldModel
    memory = get_memory_store()
    kg = get_knowledge_graph()
    wm = WorldModel(memory_store=memory, knowledge_graph=kg, api_key=settings.anthropic_api_key)
    return await wm.consolidate(max_items=max_items)


# ─────────────────────────────────────────
# Coding Brain
# ─────────────────────────────────────────

class CodingBrainRequest(BaseModel):
    task: str = Field(..., min_length=10, max_length=5000)
    task_type: str = Field(
        default="default",
        description="full_stack|backend|frontend|api|database|devops|audit|default",
    )


@router.post("/coding-brain")
async def run_coding_brain(body: CodingBrainRequest):
    """
    Multi-agent Coding Brain — orchestrates up to 8 specialized agents
    (Architecture, Backend, Frontend, DB, DevOps, Security, QA, Docs)
    to tackle complex software engineering tasks.
    """
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    from ...core.budget import check_budget
    await check_budget()

    from ...agents.coding_brain import CodingBrain
    brain = CodingBrain(api_key=settings.anthropic_api_key, model=settings.model_coding)

    task_id: str | None = None
    step_counter = {"i": 0}
    if settings.database_url:
        from ...db.postgres import create_task, update_task_status, record_task_step, save_task_result
        task_id = await create_task(
            title=body.task[:200], description=body.task,
            origin="user", assigned_agent="coding_brain",
        )
        await update_task_status(task_id, "in_progress", model_used=settings.model_coding)

        async def on_step(agent: str, preview: str) -> None:
            step_counter["i"] += 1
            await record_task_step(task_id, step_counter["i"], agent, preview, status="success")
    else:
        on_step = None  # type: ignore[assignment]

    try:
        result = await brain.run(
            messages=[{"role": "user", "content": body.task}],
            task_type=body.task_type,
            on_step=on_step,
        )
        if task_id:
            await save_task_result(task_id, result, model_used=settings.model_coding)
        return {**result, "task_id": task_id}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("coding_brain error: %s", exc, exc_info=True)
        if task_id:
            await save_task_result(task_id, {}, error=str(exc), model_used=settings.model_coding)
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────────────────────
# Self-Coding Loop
# ─────────────────────────────────────────

class CodingLoopRequest(BaseModel):
    task:           str = Field(..., min_length=10, max_length=5000)
    language:       str = Field(default="python", description="python|javascript|typescript")
    max_iterations: int = Field(default=5, ge=1, le=10)


@router.post("/coding-loop/run")
async def start_coding_loop(body: CodingLoopRequest):
    """
    Start an autonomous Self-Coding Loop as a background task.
    Returns a run_id you can poll with GET /coding-loop/{run_id}.

    Flow per iteration:
      CodingBrain generates code + tests → writes to sandbox → runs pytest →
      if fail: feeds errors back to CodingBrain → repeat.
    """
    settings = _get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    from ...core.budget import check_budget
    await check_budget()

    from ...autonomous.self_coding_loop import SelfCodingLoop
    loop   = SelfCodingLoop(api_key=settings.anthropic_api_key)
    run_id = await loop.start(
        task=body.task,
        language=body.language,
        max_iterations=body.max_iterations,
    )
    return {"run_id": run_id, "status": "running", "message": "Self-Coding Loop started"}


@router.get("/coding-loop/{run_id}")
async def get_coding_loop_status(run_id: str):
    """Get the status and result of a running or completed Self-Coding Loop."""
    from ...autonomous.self_coding_loop import get_run
    result = get_run(run_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")
    return result.to_dict()


@router.get("/coding-loop")
async def list_coding_loops(limit: int = 20):
    """List recent Self-Coding Loop runs."""
    from ...autonomous.self_coding_loop import list_runs
    return {"runs": list_runs(limit=limit)}
