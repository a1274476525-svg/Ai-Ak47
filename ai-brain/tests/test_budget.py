"""
Tests for the budget guardrail (src/core/budget.py).

check_budget() is the single choke point that blocks paid model calls once
the configured daily/monthly spend cap is hit — see AgentRegistry.run() and
the autonomous.py route handlers that call it before doing real work.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.core.budget import BudgetExceeded, check_budget


class FakePool:
    """Returns queued fetchrow results in order: [config_row, spend_row]."""

    def __init__(self, config_row: dict | None, spend_row: dict | None = None) -> None:
        self._rows = [config_row, spend_row]
        self.fetchrow = AsyncMock(side_effect=self._pop)

    async def _pop(self, *_args, **_kwargs):
        return self._rows.pop(0)


@pytest.fixture(autouse=True)
def patch_pool(monkeypatch):
    """Each test sets `pool_holder.pool` to a FakePool (or leaves None to
    simulate 'DB pool not initialised')."""
    holder = {"pool": None}

    def fake_get_pool():
        if holder["pool"] is None:
            raise RuntimeError("DB pool not initialised — call await init_pool() first")
        return holder["pool"]

    monkeypatch.setattr("src.db.postgres.get_pool", fake_get_pool)
    return holder


async def test_no_db_configured_is_a_noop(patch_pool):
    # holder["pool"] stays None -> get_pool() raises RuntimeError -> check_budget() returns quietly
    await check_budget()  # must not raise


async def test_budget_disabled_is_a_noop(patch_pool):
    patch_pool["pool"] = FakePool({"daily_limit_usd": 1, "monthly_limit_usd": None, "enabled": False})
    await check_budget()


async def test_no_config_row_is_a_noop(patch_pool):
    patch_pool["pool"] = FakePool(None)
    await check_budget()


async def test_enabled_but_unlimited_is_a_noop(patch_pool):
    patch_pool["pool"] = FakePool({"daily_limit_usd": None, "monthly_limit_usd": None, "enabled": True})
    await check_budget()


async def test_within_daily_limit_does_not_raise(patch_pool):
    patch_pool["pool"] = FakePool(
        {"daily_limit_usd": 10.0, "monthly_limit_usd": None, "enabled": True},
        {"today": 5.0, "this_month": 5.0},
    )
    await check_budget()


async def test_daily_limit_reached_raises(patch_pool):
    patch_pool["pool"] = FakePool(
        {"daily_limit_usd": 10.0, "monthly_limit_usd": None, "enabled": True},
        {"today": 10.0, "this_month": 10.0},
    )
    with pytest.raises(BudgetExceeded) as exc_info:
        await check_budget()
    assert exc_info.value.status_code == 402
    assert "Daily budget exceeded" in exc_info.value.detail


async def test_daily_limit_exceeded_raises(patch_pool):
    patch_pool["pool"] = FakePool(
        {"daily_limit_usd": 10.0, "monthly_limit_usd": None, "enabled": True},
        {"today": 15.5, "this_month": 15.5},
    )
    with pytest.raises(BudgetExceeded):
        await check_budget()


async def test_monthly_limit_reached_raises_when_daily_ok(patch_pool):
    patch_pool["pool"] = FakePool(
        {"daily_limit_usd": 100.0, "monthly_limit_usd": 50.0, "enabled": True},
        {"today": 1.0, "this_month": 50.0},
    )
    with pytest.raises(BudgetExceeded) as exc_info:
        await check_budget()
    assert "Monthly budget exceeded" in exc_info.value.detail


async def test_daily_limit_checked_before_monthly(patch_pool):
    # Both breached — daily message should win since it's checked first.
    patch_pool["pool"] = FakePool(
        {"daily_limit_usd": 5.0, "monthly_limit_usd": 5.0, "enabled": True},
        {"today": 5.0, "this_month": 5.0},
    )
    with pytest.raises(BudgetExceeded) as exc_info:
        await check_budget()
    assert "Daily budget exceeded" in exc_info.value.detail
