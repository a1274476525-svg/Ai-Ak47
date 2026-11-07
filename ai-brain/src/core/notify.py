"""
Best-effort webhook notification — fired when a task completes or fails.
In-app notifications are handled at the DB level (see trg_tasks_notify_completion
in infra/postgres/init.sql), which covers task updates from any code path.
This module only handles the optional external WEBHOOK_URL side-channel.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


async def fire_webhook(event: str, task_id: str, title: str, error: str | None = None) -> None:
    from ..config import get_settings

    url = get_settings().webhook_url
    if not url:
        return

    import httpx

    payload = {"event": event, "task_id": task_id, "title": title, "error": error}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as exc:
        log.warning("Webhook delivery failed: %s", exc)
