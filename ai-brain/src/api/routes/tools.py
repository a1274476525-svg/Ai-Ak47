"""
Tool Execution API — terminal, Docker, browser automation, and VSCode workspace.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)
router = APIRouter(tags=["tools"])


# ── Request models ─────────────────────────────────────────────────────────────

class TerminalRequest(BaseModel):
    command: str = Field(..., min_length=1, max_length=2000)


class WriteFileRequest(BaseModel):
    path:    str
    content: str = Field(..., max_length=100_000)


class BrowserRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2000)


class VscodeWriteRequest(BaseModel):
    path:    str = Field(..., min_length=1)
    content: str = Field(..., max_length=500_000)


# ── Terminal ───────────────────────────────────────────────────────────────────

@router.post("/tools/terminal/run")
async def terminal_run(body: TerminalRequest):
    """Execute a shell command in the AI OS sandbox container."""
    from ...core.tools.terminal import run_terminal
    result = run_terminal.invoke({"command": body.command})
    return {"output": result}


@router.get("/tools/terminal/read")
async def terminal_read(path: str = Query(...)):
    """Read a file from the sandbox container."""
    from ...core.tools.terminal import read_file
    result = read_file.invoke({"path": path})
    return {"content": result}


@router.post("/tools/terminal/write")
async def terminal_write(body: WriteFileRequest):
    """Write a file to the sandbox container."""
    from ...core.tools.terminal import write_file
    result = write_file.invoke({"path": body.path, "content": body.content})
    return {"result": result}


# ── Docker Manager ─────────────────────────────────────────────────────────────

@router.get("/tools/docker/containers")
async def docker_list(all_containers: bool = False):
    """List Docker containers."""
    from ...core.tools.docker_manager import list_containers
    result = list_containers.invoke({"all_containers": all_containers})
    return {"result": result}


@router.get("/tools/docker/logs/{container_name}")
async def docker_logs(container_name: str, lines: int = 50):
    """Get container logs."""
    from ...core.tools.docker_manager import get_container_logs
    result = get_container_logs.invoke({"container_name": container_name, "lines": lines})
    return {"logs": result}


@router.get("/tools/docker/stats/{container_name}")
async def docker_stats(container_name: str):
    """Get container CPU/memory stats."""
    from ...core.tools.docker_manager import get_container_stats
    result = get_container_stats.invoke({"container_name": container_name})
    return {"stats": result}


@router.post("/tools/docker/restart/{service_name}")
async def docker_restart(service_name: str):
    """Restart an AI OS service container."""
    if not service_name.startswith("aios_"):
        raise HTTPException(400, "Can only restart aios_ prefixed containers")
    from ...core.tools.docker_manager import restart_aios_service
    result = restart_aios_service.invoke({"service_name": service_name})
    return {"result": result}


# ── Browser Automation ─────────────────────────────────────────────────────────

@router.post("/tools/browser/navigate")
async def browser_navigate(body: BrowserRequest):
    """Navigate to a URL and return the page title and text content."""
    try:
        from ...core.tools.browser import async_browse
        result = await async_browse(body.url)
        if "error" in result:
            raise HTTPException(400, result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        log.error("browser_navigate error: %s", exc)
        raise HTTPException(500, f"Browser error: {exc}")


@router.post("/tools/browser/screenshot")
async def browser_screenshot(body: BrowserRequest):
    """Take a screenshot of a URL. Returns base64 PNG."""
    try:
        from ...core.tools.browser import async_screenshot
        result = await async_screenshot(body.url)
        if "error" in result:
            raise HTTPException(400, result["error"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        log.error("browser_screenshot error: %s", exc)
        raise HTTPException(500, f"Screenshot error: {exc}")


@router.get("/tools/browser/links")
async def browser_links(url: str = Query(...)):
    """Extract all hyperlinks from a web page."""
    try:
        from ...core.tools.browser import async_extract_links
        links = await async_extract_links(url)
        return {"url": url, "links": links, "count": len(links)}
    except Exception as exc:
        log.error("browser_links error: %s", exc)
        raise HTTPException(500, f"Browser error: {exc}")


# ── VSCode Server Workspace ────────────────────────────────────────────────────

@router.get("/tools/vscode/files")
async def vscode_list(directory: str = "."):
    """List files in the VSCode workspace."""
    from ...core.tools.vscode_server import vscode_list_files
    result = vscode_list_files.invoke({"directory": directory})
    return {"directory": directory, "listing": result}


@router.get("/tools/vscode/read")
async def vscode_read(path: str = Query(...)):
    """Read a file from the VSCode workspace."""
    from ...core.tools.vscode_server import vscode_read_file
    content = vscode_read_file.invoke({"path": path})
    return {"path": path, "content": content}


@router.post("/tools/vscode/write")
async def vscode_write(body: VscodeWriteRequest):
    """Write a file to the VSCode workspace (visible immediately in code-server)."""
    from ...core.tools.vscode_server import vscode_write_file
    result = vscode_write_file.invoke({"path": body.path, "content": body.content})
    return {"result": result}


@router.delete("/tools/vscode/delete")
async def vscode_delete(path: str = Query(...)):
    """Delete a file from the VSCode workspace."""
    from ...core.tools.vscode_server import vscode_delete_file
    result = vscode_delete_file.invoke({"path": path})
    return {"result": result}
