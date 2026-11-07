"""
Task Executor — picks up pending tasks from PostgreSQL and runs them via AgentRegistry.

Flow per task:
  1. Mark task as `in_progress`
  2. Dispatch to the assigned agent (coding / research / testing / security / content)
  3. Save result + mark `completed`  — or save error + mark `failed`
  4. Store result summary in Qdrant memory

The executor is called by the APScheduler every 15 minutes.
It processes up to MAX_CONCURRENT tasks per run using asyncio.gather.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

MAX_CONCURRENT = 3      # tasks processed per scheduler tick
TASK_TIMEOUT   = 300    # seconds before a task is forcibly cancelled

# Maps DB agent names → TaskType values expected by AgentRegistry
_AGENT_TASK_MAP: dict[str, str] = {
    "coding":   "coding",
    "research": "research",
    "testing":  "testing",
    "security": "security",
    "content":  "creative",
    "devops":   "coding",
    "general":  "general",
}


@dataclass
class ExecutionResult:
    task_id: str
    title: str
    success: bool
    agent: str
    duration_ms: int
    output: str = ""
    error: str = ""


@dataclass
class ExecutorReport:
    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    results: list[ExecutionResult] = field(default_factory=list)


class TaskExecutor:
    def __init__(self, agent_registry, memory_store=None) -> None:
        self._agents  = agent_registry
        self._memory  = memory_store

    # ── Single task execution ────────────────────────────────────────────────

    async def _execute_one(self, task: dict) -> ExecutionResult:
        from ..db.postgres import update_task_status, save_task_result

        task_id = str(task["id"])
        title   = task.get("title", "")
        agent   = task.get("assigned_agent") or "general"
        desc    = task.get("description") or title

        log.info("Executor: starting task %s [%s] — %s", task_id[:8], agent, title[:60])
        await update_task_status(task_id, "in_progress")

        start = time.monotonic()
        try:
            # Build message list for AgentRegistry
            content = f"{title}\n\n{desc}" if desc and desc != title else title
            messages = [{"role": "user", "content": content}]
            task_type = _AGENT_TASK_MAP.get(agent, "general")

            response = await asyncio.wait_for(
                self._agents.run(
                    messages=messages,
                    task_type=task_type,
                    preferred_provider=None,
                    use_debate=False,
                ),
                timeout=TASK_TIMEOUT,
            )

            duration_ms = int((time.monotonic() - start) * 1000)
            output = response.get("content", "") if isinstance(response, dict) else str(response)
            model  = response.get("model") if isinstance(response, dict) else None

            await save_task_result(
                task_id=task_id,
                result={"output": output[:4000], "agent": agent, "duration_ms": duration_ms},
                model_used=model,
            )

            # Store result in memory
            if self._memory and output:
                try:
                    await self._memory.store(
                        content=f"Task result: {title}\n\n{output[:1000]}",
                        topic=f"task_result:{agent}",
                        source="task_executor",
                        task_id=task_id,
                    )
                except Exception:
                    pass

            log.info("Executor: completed %s in %dms", task_id[:8], duration_ms)
            return ExecutionResult(
                task_id=task_id, title=title, success=True,
                agent=agent, duration_ms=duration_ms, output=output[:500],
            )

        except asyncio.TimeoutError:
            duration_ms = int((time.monotonic() - start) * 1000)
            err = f"Task timed out after {TASK_TIMEOUT}s"
            log.warning("Executor: timeout %s", task_id[:8])
            await save_task_result(task_id=task_id, result={}, error=err)
            return ExecutionResult(
                task_id=task_id, title=title, success=False,
                agent=agent, duration_ms=duration_ms, error=err,
            )

        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            err = str(exc)
            log.error("Executor: failed %s — %s", task_id[:8], err, exc_info=True)
            await save_task_result(task_id=task_id, result={}, error=err[:500])
            return ExecutionResult(
                task_id=task_id, title=title, success=False,
                agent=agent, duration_ms=duration_ms, error=err,
            )

    # ── Batch run ────────────────────────────────────────────────────────────

    async def run(self, max_tasks: int = MAX_CONCURRENT) -> ExecutorReport:
        from ..db.postgres import get_pending_tasks

        report = ExecutorReport()

        pending = await get_pending_tasks(limit=max_tasks)
        if not pending:
            log.info("Executor: no pending tasks")
            return report

        # Skip tasks with no agent assigned — mark as skipped
        runnable = []
        for task in pending:
            if not task.get("assigned_agent"):
                report.skipped += 1
            else:
                runnable.append(task)

        log.info("Executor: %d tasks to run (%d skipped)", len(runnable), report.skipped)

        results = await asyncio.gather(
            *[self._execute_one(t) for t in runnable],
            return_exceptions=True,
        )

        for res in results:
            if isinstance(res, Exception):
                report.failed += 1
            elif res.success:
                report.succeeded += 1
            else:
                report.failed += 1

            if isinstance(res, ExecutionResult):
                report.results.append(res)

        report.processed = len(runnable)
        log.info(
            "Executor: run complete — processed=%d ok=%d failed=%d skipped=%d",
            report.processed, report.succeeded, report.failed, report.skipped,
        )
        return report


