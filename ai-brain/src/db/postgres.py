"""
asyncpg connection pool — shared across the application.
Initialised once at startup via init_pool(), closed at shutdown.
"""
from __future__ import annotations

import logging
import asyncpg

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_pool(database_url: str) -> None:
    global _pool
    if _pool is not None:
        return
    _pool = await asyncpg.create_pool(
        database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    log.info("PostgreSQL pool ready")


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call await init_pool() first")
    return _pool


# ── Skill helpers ─────────────────────────────────────────────────────────────

async def get_all_skills() -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, name, category, level, target_level, is_learning, priority, last_assessed "
        "FROM skills ORDER BY priority DESC, level ASC"
    )
    return [dict(r) for r in rows]


async def get_skill_gaps(threshold: float = 70.0) -> list[dict]:
    """Skills where level < threshold, ordered by priority."""
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, name, category, level, target_level, priority "
        "FROM skills WHERE level < $1 ORDER BY priority DESC, level ASC",
        threshold,
    )
    return [dict(r) for r in rows]


async def update_skill_level(skill_name: str, new_level: float, is_learning: bool = False) -> None:
    pool = get_pool()
    await pool.execute(
        """UPDATE skills
           SET level = $1, is_learning = $2, last_assessed = NOW(), updated_at = NOW()
           WHERE name = $3""",
        round(new_level, 2), is_learning, skill_name,
    )


async def upsert_skill(name: str, category: str, level: float = 0.0, priority: int = 5) -> None:
    pool = get_pool()
    await pool.execute(
        """INSERT INTO skills (name, category, level, priority)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO NOTHING""",
        name, category, level, priority,
    )


# ── Task step helpers (trace log) ──────────────────────────────────────────────

async def record_task_step(
    task_id: str,
    step_index: int,
    agent: str,
    message: str,
    status: str = "success",
) -> None:
    pool = get_pool()
    await pool.execute(
        """INSERT INTO task_steps (task_id, step_index, agent, message, status)
           VALUES ($1, $2, $3, $4, $5)""",
        task_id, step_index, agent, message, status,
    )


async def get_task_steps(task_id: str) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, step_index, agent, message, status, created_at "
        "FROM task_steps WHERE task_id = $1 ORDER BY step_index ASC",
        task_id,
    )
    return [dict(r) for r in rows]


# ── Task helpers ──────────────────────────────────────────────────────────────

async def create_task(
    title: str,
    description: str = "",
    origin: str = "autonomous",
    assigned_agent: str | None = None,
    priority: int = 5,
    parent_task_id: str | None = None,
    metadata: dict | None = None,
) -> str:
    """Create a task in PostgreSQL. Returns the new task UUID."""
    import json
    pool = get_pool()
    row = await pool.fetchrow(
        """INSERT INTO tasks (title, description, origin, assigned_agent, priority, parent_task_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id""",
        title, description, origin, assigned_agent, priority,
        parent_task_id, json.dumps(metadata or {}),
    )
    return str(row["id"])


async def get_pending_tasks(limit: int = 20) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, title, description, assigned_agent, priority, origin, metadata "
        "FROM tasks WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT $1",
        limit,
    )
    return [dict(r) for r in rows]


async def get_task_by_id(task_id: str) -> dict | None:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, title, description, status, assigned_agent, priority, origin, "
        "result, error, started_at, completed_at, metadata "
        "FROM tasks WHERE id = $1",
        task_id,
    )
    return dict(row) if row else None


async def update_task_status(
    task_id: str,
    status: str,
    model_used: str | None = None,
) -> None:
    pool = get_pool()
    if status == "in_progress":
        await pool.execute(
            "UPDATE tasks SET status = $1, model_used = $2, started_at = NOW(), updated_at = NOW() WHERE id = $3",
            status, model_used, task_id,
        )
    elif status in ("completed", "failed", "cancelled"):
        row = await pool.fetchrow(
            "UPDATE tasks SET status = $1, model_used = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING title",
            status, model_used, task_id,
        )
        if status in ("completed", "failed") and row:
            from ..core.notify import fire_webhook
            await fire_webhook(f"task_{status}", task_id, row["title"])
    else:
        await pool.execute(
            "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2",
            status, task_id,
        )


async def save_task_result(
    task_id: str,
    result: dict,
    error: str | None = None,
    model_used: str | None = None,
) -> None:
    import json
    pool = get_pool()
    status = "failed" if error else "completed"
    row = await pool.fetchrow(
        """UPDATE tasks
           SET status = $1, result = $2, error = $3, model_used = $4,
               completed_at = NOW(), updated_at = NOW()
           WHERE id = $5
           RETURNING title""",
        status, json.dumps(result), error, model_used, task_id,
    )
    if row:
        from ..core.notify import fire_webhook
        await fire_webhook(f"task_{status}", task_id, row["title"], error)


async def get_recent_tasks(limit: int = 20, status: str | None = None) -> list[dict]:
    pool = get_pool()
    if status:
        rows = await pool.fetch(
            "SELECT id, title, status, assigned_agent, priority, origin, "
            "started_at, completed_at, created_at "
            "FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
            status, limit,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, title, status, assigned_agent, priority, origin, "
            "started_at, completed_at, created_at "
            "FROM tasks ORDER BY created_at DESC LIMIT $1",
            limit,
        )
    return [dict(r) for r in rows]
