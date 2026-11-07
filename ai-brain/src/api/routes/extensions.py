"""
Extensions API — manage AI OS plugins loaded from EXTENSIONS_DIR.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException

log = logging.getLogger(__name__)
router = APIRouter(prefix="/extensions", tags=["extensions"])


@router.get("")
async def list_extensions():
    """List all currently loaded extensions."""
    from ...core.extensions.registry import list_extensions as _list
    return {"extensions": _list()}


@router.post("/reload")
async def reload_extensions():
    """Shut down and re-discover all extensions from EXTENSIONS_DIR."""
    from ...core.extensions.registry import reload_extensions as _reload
    try:
        count = _reload()
        return {"reloaded": True, "count": count}
    except Exception as exc:
        log.error("extensions/reload: %s", exc)
        raise HTTPException(500, "Failed to reload extensions")
