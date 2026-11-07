"""
Budget Config API — read/update the global spend guardrail and see current usage.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)
router = APIRouter(prefix="/budget", tags=["budget"])


class BudgetConfig(BaseModel):
    daily_limit_usd:   float | None = Field(default=None, ge=0)
    monthly_limit_usd: float | None = Field(default=None, ge=0)
    enabled: bool = False


class BudgetStatus(BudgetConfig):
    today_spend_usd: float
    month_spend_usd: float


def _pool():
    from ...db.postgres import get_pool
    return get_pool()


@router.get("", response_model=BudgetStatus)
async def get_budget():
    try:
        pool = _pool()
        config = await pool.fetchrow(
            "SELECT daily_limit_usd, monthly_limit_usd, enabled FROM budget_config WHERE id = 1"
        )
        spend = await pool.fetchrow(
            """SELECT
                 COALESCE(SUM(cost_usd) FILTER (WHERE created_at > date_trunc('day', NOW())), 0)   AS today,
                 COALESCE(SUM(cost_usd) FILTER (WHERE created_at > date_trunc('month', NOW())), 0) AS this_month
               FROM (
                 SELECT cost_usd, created_at FROM messages
                 UNION ALL
                 SELECT cost_usd, created_at FROM agent_runs
               ) combined"""
        )
        return BudgetStatus(
            daily_limit_usd=float(config["daily_limit_usd"]) if config and config["daily_limit_usd"] is not None else None,
            monthly_limit_usd=float(config["monthly_limit_usd"]) if config and config["monthly_limit_usd"] is not None else None,
            enabled=bool(config["enabled"]) if config else False,
            today_spend_usd=round(float(spend["today"] or 0), 4),
            month_spend_usd=round(float(spend["this_month"] or 0), 4),
        )
    except Exception as exc:
        log.error("get_budget: %s", exc)
        raise HTTPException(503, "Database unavailable")


@router.put("", response_model=BudgetStatus)
async def update_budget(body: BudgetConfig):
    try:
        pool = _pool()
        await pool.execute(
            """UPDATE budget_config
               SET daily_limit_usd = $1, monthly_limit_usd = $2, enabled = $3, updated_at = NOW()
               WHERE id = 1""",
            body.daily_limit_usd, body.monthly_limit_usd, body.enabled,
        )
        return await get_budget()
    except Exception as exc:
        log.error("update_budget: %s", exc)
        raise HTTPException(503, "Database unavailable")
