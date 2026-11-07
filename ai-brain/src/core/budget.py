"""
Budget guardrail — blocks provider calls once the configured spend cap is hit.
Reads the `budget_config` singleton row and sums cost_usd from messages + agent_runs
for the current day/month. No-ops when no DB pool is configured or budgeting is disabled.
"""
from __future__ import annotations

import logging
from fastapi import HTTPException

log = logging.getLogger(__name__)


class BudgetExceeded(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=402, detail=detail)


async def check_budget() -> None:
    """Raise BudgetExceeded if today's or this month's spend is at/over the configured cap."""
    from ..db.postgres import get_pool

    try:
        pool = get_pool()
    except RuntimeError:
        return  # no DB configured — budget enforcement disabled

    config = await pool.fetchrow(
        "SELECT daily_limit_usd, monthly_limit_usd, enabled FROM budget_config WHERE id = 1"
    )
    if not config or not config["enabled"]:
        return

    daily_limit   = config["daily_limit_usd"]
    monthly_limit = config["monthly_limit_usd"]
    if daily_limit is None and monthly_limit is None:
        return

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

    today_spend = float(spend["today"] or 0)
    month_spend = float(spend["this_month"] or 0)

    if daily_limit is not None and today_spend >= float(daily_limit):
        raise BudgetExceeded(
            f"Daily budget exceeded: ${today_spend:.2f} spent of ${float(daily_limit):.2f} limit"
        )
    if monthly_limit is not None and month_spend >= float(monthly_limit):
        raise BudgetExceeded(
            f"Monthly budget exceeded: ${month_spend:.2f} spent of ${float(monthly_limit):.2f} limit"
        )
