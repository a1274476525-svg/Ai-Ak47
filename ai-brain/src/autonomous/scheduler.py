"""
APScheduler — runs background jobs on a fixed schedule.

Jobs:
  • daily_research      3:00 AM UTC  — GitHub Trending + HN + ArXiv pipeline
  • skill_learning      4:00 AM UTC  — detect gaps + execute learning cycle
  • pending_tasks_check 6:00 AM UTC  — re-queue stale tasks

The scheduler is started in main.py lifespan alongside the FastAPI app.
"""
from __future__ import annotations

import logging
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


# ─────────────────────────────────────────
# Job implementations
# ─────────────────────────────────────────

async def job_daily_research(config: Any, memory_store: Any) -> None:
    """Run the daily research pipeline (GitHub + HN + ArXiv)."""
    log.info("[Scheduler] Starting daily_research job")
    try:
        from .researcher import ResearchPipeline
        pipeline = ResearchPipeline(api_key=config.anthropic_api_key)
        report = await pipeline.run(memory_store=memory_store)
        log.info(
            "[Scheduler] daily_research done — repos=%d hn=%d papers=%d stored=%d tasks=%d",
            len(report.repos), len(report.hn_stories), len(report.papers),
            report.knowledge_stored, report.tasks_created,
        )
    except Exception as exc:
        log.error("[Scheduler] daily_research failed: %s", exc, exc_info=True)


async def job_skill_learning(config: Any, memory_store: Any) -> None:
    """Run the skill acquisition cycle for top-priority gaps."""
    log.info("[Scheduler] Starting skill_learning job")
    try:
        from .skill_engine import SkillEngine
        engine = SkillEngine(api_key=config.anthropic_api_key)
        results = await engine.run_cycle(memory_store=memory_store, max_skills=2)
        for r in results:
            log.info("[Scheduler] skill_learning: %s", r.summary)
    except Exception as exc:
        log.error("[Scheduler] skill_learning failed: %s", exc, exc_info=True)


async def job_pending_tasks_check() -> None:
    """Log stale pending tasks — future versions will auto-assign them."""
    log.info("[Scheduler] Checking pending tasks")
    try:
        from ..db.postgres import get_pending_tasks
        tasks = await get_pending_tasks(limit=50)
        if tasks:
            log.info("[Scheduler] %d pending tasks in queue", len(tasks))
        else:
            log.info("[Scheduler] No pending tasks")
    except Exception as exc:
        log.error("[Scheduler] pending_tasks_check failed: %s", exc)


async def job_self_evaluate(config: Any, memory_store: Any) -> None:
    """Evaluate recent task outputs and generate self-improvement insights."""
    log.info("[Scheduler] Starting self_evaluate job")
    try:
        from .evaluator import SelfEvaluator
        evaluator = SelfEvaluator(api_key=config.anthropic_api_key)
        report = await evaluator.run(memory_store=memory_store, max_tasks=20)
        log.info(
            "[Scheduler] self_evaluate done — evaluated=%d avg=%.0f patterns=%d improvements=%d",
            report.tasks_evaluated, report.avg_score, len(report.patterns), len(report.improvements),
        )
    except Exception as exc:
        log.error("[Scheduler] self_evaluate failed: %s", exc, exc_info=True)


async def job_execute_tasks(agent_registry: Any, memory_store: Any) -> None:
    """Run the task executor — processes up to 3 pending tasks per tick."""
    log.info("[Scheduler] Starting execute_tasks job")
    try:
        from .executor import TaskExecutor
        executor = TaskExecutor(agent_registry=agent_registry, memory_store=memory_store)
        report = await executor.run(max_tasks=3)
        log.info(
            "[Scheduler] execute_tasks done — processed=%d ok=%d failed=%d",
            report.processed, report.succeeded, report.failed,
        )
    except Exception as exc:
        log.error("[Scheduler] execute_tasks failed: %s", exc, exc_info=True)


async def job_world_model_consolidate(config: Any, memory_store: Any, knowledge_graph: Any) -> None:
    """Consolidate the World Model — merge related facts and strengthen graph connections."""
    log.info("[Scheduler] Starting world_model_consolidate job")
    try:
        from .world_model import WorldModel
        wm = WorldModel(
            memory_store=memory_store,
            knowledge_graph=knowledge_graph,
            api_key=config.anthropic_api_key,
        )
        result = await wm.consolidate(max_items=50)
        log.info("[Scheduler] world_model_consolidate done — %s", result)
    except Exception as exc:
        log.error("[Scheduler] world_model_consolidate failed: %s", exc, exc_info=True)


# ─────────────────────────────────────────
# Scheduler lifecycle
# ─────────────────────────────────────────

def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    return _scheduler


def start_scheduler(config: Any, memory_store: Any, agent_registry: Any = None, knowledge_graph: Any = None) -> AsyncIOScheduler:
    """Build and start the scheduler with all jobs registered."""
    scheduler = get_scheduler()

    # Daily research — 3:00 AM UTC
    scheduler.add_job(
        job_daily_research,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        args=[config, memory_store],
        id="daily_research",
        name="Daily Research Pipeline",
        replace_existing=True,
        misfire_grace_time=3600,  # allow up to 1h late start
    )

    # Skill learning — 4:00 AM UTC (after research so new skills are already in DB)
    scheduler.add_job(
        job_skill_learning,
        trigger=CronTrigger(hour=4, minute=0, timezone="UTC"),
        args=[config, memory_store],
        id="skill_learning",
        name="Skill Acquisition Cycle",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Pending tasks check — every day at 6:00 AM UTC
    scheduler.add_job(
        job_pending_tasks_check,
        trigger=CronTrigger(hour=6, minute=0, timezone="UTC"),
        id="pending_tasks_check",
        name="Pending Tasks Monitor",
        replace_existing=True,
        misfire_grace_time=1800,
    )

    # Self-evaluation — every day at 05:00 UTC (after skill learning)
    scheduler.add_job(
        job_self_evaluate,
        trigger=CronTrigger(hour=5, minute=0, timezone="UTC"),
        args=[config, memory_store],
        id="self_evaluate",
        name="Self-Improvement Evaluator",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Task execution — every 15 minutes (only if agent_registry available)
    if agent_registry is not None:
        from apscheduler.triggers.interval import IntervalTrigger
        scheduler.add_job(
            job_execute_tasks,
            trigger=IntervalTrigger(minutes=15),
            args=[agent_registry, memory_store],
            id="execute_tasks",
            name="Autonomous Task Executor",
            replace_existing=True,
            misfire_grace_time=300,
        )

    # World Model consolidation — every day at 02:00 UTC (before research pipeline)
    if knowledge_graph is not None:
        scheduler.add_job(
            job_world_model_consolidate,
            trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
            args=[config, memory_store, knowledge_graph],
            id="world_model_consolidate",
            name="World Model Consolidation",
            replace_existing=True,
            misfire_grace_time=3600,
        )

    scheduler.start()
    job_names = [j.name for j in scheduler.get_jobs()]
    log.info("[Scheduler] Started — jobs: %s", ", ".join(job_names))
    return scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("[Scheduler] Stopped")
    _scheduler = None
