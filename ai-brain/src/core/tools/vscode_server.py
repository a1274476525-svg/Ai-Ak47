"""
VSCode Server workspace tool — read/write files in the shared code-server workspace.

The workspace is a Docker volume mounted at VSCODE_WORKSPACE (default /vscode-workspace).
It is shared between the ai-brain container and the code-server container, so files
written here are immediately visible in the VSCode editor (port 8080).

Tools:
  vscode_list_files  — list files/dirs in the workspace
  vscode_read_file   — read a workspace file
  vscode_write_file  — write/create a workspace file
  vscode_delete_file — delete a workspace file
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from langchain_core.tools import tool

log = logging.getLogger(__name__)

WORKSPACE = Path(os.getenv("VSCODE_WORKSPACE", "/vscode-workspace"))
MAX_READ  = 50_000   # 50 KB max for read
MAX_WRITE = 500_000  # 500 KB max for write


def _safe_path(relative: str) -> Path | None:
    """Resolve path and verify it stays inside WORKSPACE."""
    try:
        resolved = (WORKSPACE / relative.lstrip("/")).resolve()
        if not str(resolved).startswith(str(WORKSPACE.resolve())):
            return None
        return resolved
    except Exception:
        return None


@tool
def vscode_list_files(directory: str = ".") -> str:
    """
    List files and directories in the VSCode workspace.
    Pass a relative path to list a subdirectory; defaults to workspace root.
    Returns a formatted tree showing [DIR] and [FILE] entries.
    """
    path = _safe_path(directory)
    if not path:
        return "Error: invalid path (path traversal blocked)"
    if not WORKSPACE.exists():
        return f"Workspace not mounted at {WORKSPACE}. Is code-server running?"
    if not path.is_dir():
        return f"Directory not found: {directory}"

    lines: list[str] = []
    try:
        for item in sorted(path.iterdir()):
            rel = str(item.relative_to(WORKSPACE))
            tag = "[DIR] " if item.is_dir() else "[FILE]"
            lines.append(f"{tag} {rel}")
    except PermissionError as exc:
        return f"Permission error: {exc}"

    return "\n".join(lines) if lines else "(empty directory)"


@tool
def vscode_read_file(path: str) -> str:
    """
    Read the contents of a file in the VSCode workspace.
    Path should be relative to workspace root (e.g. 'src/main.py').
    Returns file contents (truncated at 50 KB).
    """
    p = _safe_path(path)
    if not p:
        return "Error: invalid path"
    if not WORKSPACE.exists():
        return f"Workspace not mounted at {WORKSPACE}."
    if not p.exists():
        return f"File not found: {path}"
    if p.is_dir():
        return f"Error: '{path}' is a directory. Use vscode_list_files to browse."

    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        if len(content) > MAX_READ:
            content = content[:MAX_READ] + f"\n\n... (truncated — {len(content)} total chars)"
        return content
    except Exception as exc:
        return f"Error reading file: {exc}"


@tool
def vscode_write_file(path: str, content: str) -> str:
    """
    Write (create or overwrite) a file in the VSCode workspace.
    Path is relative to workspace root. Parent directories are created automatically.
    The file appears immediately in the code-server editor.
    """
    p = _safe_path(path)
    if not p:
        return "Error: invalid path (path traversal blocked)"
    if len(content) > MAX_WRITE:
        return f"Error: content too large ({len(content)} chars, max {MAX_WRITE})"

    try:
        WORKSPACE.mkdir(parents=True, exist_ok=True)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"Written {len(content)} chars to workspace/{path}"
    except Exception as exc:
        return f"Error writing file: {exc}"


@tool
def vscode_delete_file(path: str) -> str:
    """
    Delete a file from the VSCode workspace.
    Only deletes files — use terminal tool to remove directories.
    """
    p = _safe_path(path)
    if not p:
        return "Error: invalid path"
    if not p.exists():
        return f"File not found: {path}"
    if p.is_dir():
        return "Error: cannot delete directories with this tool. Use the terminal."

    try:
        p.unlink()
        return f"Deleted workspace/{path}"
    except Exception as exc:
        return f"Error deleting file: {exc}"
