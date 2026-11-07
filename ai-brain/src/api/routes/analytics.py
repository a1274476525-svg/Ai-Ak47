"""
Analytics API — aggregated metrics from PostgreSQL.

Endpoints:
  GET /analytics/overview          — key numbers (tasks, messages, cost, skills)
  GET /analytics/tasks             — task breakdown by agent and status (last 30 days)
  GET /analytics/models            — model/provider usage from agent_runs
  GET /analytics/skills            — skill progress snapshot
  GET /analytics/timeline          — tasks created per day (last 30 days)
  GET /analytics/knowledge         — knowledge base stats
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

log = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


def _pool():
    from ...db.postgres import get_pool
    return get_pool()


# ─────────────────────────────────────────
# Overview
# ─────────────────────────────────────────

@router.get("/overview")
async def overview():
    """High-level KPIs: tasks, messages, cost, skills."""
    try:
        pool = _pool()

        # Tasks by status
        task_rows = await pool.fetch(
            "SELECT status, COUNT(*) AS n FROM tasks GROUP BY status"
        )
        tasks_by_status = {r["status"]: int(r["n"]) for r in task_rows}
        total_tasks = sum(tasks_by_status.values())

        # Messages + cost
        msg_row = await pool.fetchrow(
            "SELECT COUNT(*) AS n, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens, "
            "COALESCE(SUM(cost_usd), 0) AS cost FROM messages"
        )

        # Agent runs cost
        run_row = await pool.fetchrow(
            "SELECT COUNT(*) AS n, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens, "
            "COALESCE(SUM(cost_usd), 0) AS cost, "
            "COALESCE(AVG(duration_ms) FILTER (WHERE status = 'success'), 0) AS avg_ms "
            "FROM agent_runs"
        )

        # Conversations
        conv_count = await pool.fetchval("SELECT COUNT(*) FROM conversations")

        # Skills
        skill_row = await pool.fetchrow(
            "SELECT COUNT(*) AS n, COALESCE(AVG(level), 0) AS avg_level, "
            "COUNT(*) FILTER (WHERE level >= target_level) AS mastered "
            "FROM skills"
        )

        # Knowledge
        knowledge_count = await pool.fetchval("SELECT COUNT(*) FROM knowledge_items")

        total_cost = float(msg_row["cost"] or 0) + float(run_row["cost"] or 0)
        total_tokens = int(msg_row["tokens"] or 0) + int(run_row["tokens"] or 0)

        return {
            "tasks": {
                "total":       total_tasks,
                "by_status":   tasks_by_status,
                "success_rate": round(
                    tasks_by_status.get("completed", 0) / max(total_tasks, 1) * 100, 1
                ),
            },
            "messages": {
                "total":         int(msg_row["n"] or 0),
                "conversations": int(conv_count or 0),
            },
            "agent_runs": {
                "total":      int(run_row["n"] or 0),
                "avg_dur_ms": round(float(run_row["avg_ms"] or 0)),
            },
            "cost": {
                "total_usd":   round(total_cost, 4),
                "total_tokens": total_tokens,
            },
            "skills": {
                "total":    int(skill_row["n"] or 0),
                "avg_level": round(float(skill_row["avg_level"] or 0), 1),
                "mastered":  int(skill_row["mastered"] or 0),
            },
            "knowledge_items": int(knowledge_count or 0),
        }
    except Exception as exc:
        log.error("analytics/overview: %s", exc)
        raise HTTPException(503, "Database unavailable")


# ─────────────────────────────────────────
# Tasks breakdown
# ─────────────────────────────────────────

@router.get("/tasks")
async def tasks_breakdown(days: int = 30):
    """Task counts grouped by agent and status for the last N days."""
    try:
        pool = _pool()

        # By agent
        agent_rows = await pool.fetch(
            """SELECT
                 assigned_agent,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                 COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
                 COALESCE(AVG(
                   EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
                 ) FILTER (WHERE status = 'completed'), 0) AS avg_ms
               FROM tasks
               WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
               GROUP BY assigned_agent
               ORDER BY total DESC
               LIMIT 20""",
            str(days),
        )

        # By origin
        origin_rows = await pool.fetch(
            "SELECT origin, COUNT(*) AS n FROM tasks "
            "WHERE created_at > NOW() - ($1 || ' days')::INTERVAL "
            "GROUP BY origin",
            str(days),
        )

        return {
            "days": days,
            "by_agent": [
                {
                    "agent":     r["assigned_agent"] or "unassigned",
                    "total":     int(r["total"]),
                    "completed": int(r["completed"]),
                    "failed":    int(r["failed"]),
                    "success_rate": round(
                        int(r["completed"]) / max(int(r["total"]), 1) * 100, 1
                    ),
                    "avg_duration_ms": round(float(r["avg_ms"] or 0)),
                }
                for r in agent_rows
            ],
            "by_origin": {r["origin"]: int(r["n"]) for r in origin_rows},
        }
    except Exception as exc:
        log.error("analytics/tasks: %s", exc)
        raise HTTPException(503, "Database unavailable")


# ─────────────────────────────────────────
# Model usage
# ─────────────────────────────────────────

@router.get("/models")
async def model_usage(days: int = 30):
    """Token usage, cost, and success rate per model (from agent_runs)."""
    try:
        pool = _pool()
        rows = await pool.fetch(
            """SELECT
                 model_used,
                 COUNT(*) AS runs,
                 COUNT(*) FILTER (WHERE status = 'success') AS successes,
                 COALESCE(SUM(tokens_in),  0) AS tokens_in,
                 COALESCE(SUM(tokens_out), 0) AS tokens_out,
                 COALESCE(SUM(cost_usd),   0) AS cost,
                 COALESCE(AVG(duration_ms) FILTER (WHERE status = 'success'), 0) AS avg_ms
               FROM agent_runs
               WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
               GROUP BY model_used
               ORDER BY runs DESC
               LIMIT 20""",
            str(days),
        )

        # Also get message-level provider usage
        msg_rows = await pool.fetch(
            """SELECT provider, model,
                 COUNT(*) AS messages,
                 COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens,
                 COALESCE(SUM(cost_usd), 0) AS cost
               FROM messages
               WHERE provider IS NOT NULL
                 AND created_at > NOW() - ($1 || ' days')::INTERVAL
               GROUP BY provider, model
               ORDER BY messages DESC
               LIMIT 20""",
            str(days),
        )

        return {
            "days": days,
            "agent_runs": [
                {
                    "model":      r["model_used"] or "unknown",
                    "runs":       int(r["runs"]),
                    "success_rate": round(
                        int(r["successes"]) / max(int(r["runs"]), 1) * 100, 1
                    ),
                    "tokens_in":  int(r["tokens_in"]),
                    "tokens_out": int(r["tokens_out"]),
                    "cost_usd":   round(float(r["cost"]), 4),
                    "avg_ms":     round(float(r["avg_ms"] or 0)),
                }
                for r in rows
            ],
            "messages": [
                {
                    "provider": r["provider"],
                    "model":    r["model"] or "unknown",
                    "messages": int(r["messages"]),
                    "tokens":   int(r["tokens"]),
                    "cost_usd": round(float(r["cost"]), 4),
                }
                for r in msg_rows
            ],
        }
    except Exception as exc:
        log.error("analytics/models: %s", exc)
        raise HTTPException(503, "Database unavailable")


# ─────────────────────────────────────────
# Skill progress
# ─────────────────────────────────────────

@router.get("/skills")
async def skill_progress():
    """Skill levels vs targets, grouped by category."""
    try:
        pool = _pool()
        rows = await pool.fetch(
            "SELECT name, category, level, target_level, is_learning, priority "
            "FROM skills ORDER BY priority DESC, level DESC"
        )

        by_category: dict[str, list] = {}
        for r in rows:
            cat = r["category"] or "other"
            by_category.setdefault(cat, []).append({
                "name":        r["name"],
                "level":       float(r["level"]),
                "target":      float(r["target_level"]),
                "gap":         round(float(r["target_level"]) - float(r["level"]), 1),
                "is_learning": bool(r["is_learning"]),
                "mastered":    float(r["level"]) >= float(r["target_level"]),
            })

        return {
            "total":       len(rows),
            "by_category": by_category,
            "avg_level":   round(sum(float(r["level"]) for r in rows) / max(len(rows), 1), 1),
            "mastered":    sum(1 for r in rows if float(r["level"]) >= float(r["target_level"])),
        }
    except Exception as exc:
        log.error("analytics/skills: %s", exc)
        raise HTTPException(503, "Database unavailable")


# ─────────────────────────────────────────
# Daily timeline
# ─────────────────────────────────────────

@router.get("/timeline")
async def daily_timeline(days: int = 30):
    """Tasks and messages created per day for the last N days."""
    try:
        pool = _pool()

        task_rows = await pool.fetch(
            """SELECT
                 DATE_TRUNC('day', created_at) AS day,
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                 COUNT(*) FILTER (WHERE status = 'failed')    AS failed
               FROM tasks
               WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
               GROUP BY 1
               ORDER BY 1 ASC""",
            str(days),
        )

        msg_rows = await pool.fetch(
            """SELECT
                 DATE_TRUNC('day', created_at) AS day,
                 COUNT(*) AS n
               FROM messages
               WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
               GROUP BY 1
               ORDER BY 1 ASC""",
            str(days),
        )

        return {
            "days": days,
            "tasks": [
                {
                    "day":       r["day"].date().isoformat(),
                    "total":     int(r["total"]),
                    "completed": int(r["completed"]),
                    "failed":    int(r["failed"]),
                }
                for r in task_rows
            ],
            "messages": [
                {"day": r["day"].date().isoformat(), "count": int(r["n"])}
                for r in msg_rows
            ],
        }
    except Exception as exc:
        log.error("analytics/timeline: %s", exc)
        raise HTTPException(503, "Database unavailable")


# ─────────────────────────────────────────
# Knowledge base
# ─────────────────────────────────────────

@router.get("/knowledge")
async def knowledge_stats():
    """Knowledge base statistics."""
    try:
        pool = _pool()

        source_rows = await pool.fetch(
            "SELECT source_type, COUNT(*) AS n, AVG(confidence) AS avg_conf "
            "FROM knowledge_items GROUP BY source_type ORDER BY n DESC"
        )
        lang_rows = await pool.fetch(
            "SELECT language, COUNT(*) AS n FROM knowledge_items "
            "WHERE language IS NOT NULL GROUP BY language ORDER BY n DESC LIMIT 10"
        )
        total = await pool.fetchval("SELECT COUNT(*) FROM knowledge_items")

        return {
            "total":        int(total or 0),
            "by_source":    [
                {
                    "source":    r["source_type"] or "unknown",
                    "count":     int(r["n"]),
                    "avg_confidence": round(float(r["avg_conf"] or 0), 3),
                }
                for r in source_rows
            ],
            "by_language":  [{"language": r["language"], "count": int(r["n"])} for r in lang_rows],
        }
    except Exception as exc:
        log.error("analytics/knowledge: %s", exc)
        raise HTTPException(503, "Database unavailable")
