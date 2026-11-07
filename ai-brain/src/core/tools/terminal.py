"""
Terminal tool — execute shell commands in a sandboxed Docker container.

Safety model:
  - Commands run inside the `aios_sandbox` Docker container (isolated from host)
  - 30-second timeout per command
  - Output truncated at 4000 chars
  - Blocked commands: rm -rf /, shutdown, halt, reboot, fork bomb patterns

The sandbox container must be running (started by docker-compose).
Falls back to a warning message when Docker is unavailable.
"""
from __future__ import annotations

import logging
import re
import shlex
import subprocess
from langchain_core.tools import tool

log = logging.getLogger(__name__)

SANDBOX_CONTAINER = "aios_sandbox"
TIMEOUT_SECONDS   = 30
MAX_OUTPUT        = 4000

# Dangerous pattern blocklist
_BLOCKED = re.compile(
    r"(rm\s+-rf\s+/|:(){ :|:&};:|shutdown|halt|reboot|mkfs|dd\s+if=|>>\s*/dev/sd)"
)


def _is_dangerous(cmd: str) -> bool:
    return bool(_BLOCKED.search(cmd))


@tool
def run_terminal(command: str) -> str:
    """
    Execute a shell command in the AI OS sandbox container and return the output.
    Use for: running tests, installing packages, compiling code, file operations.
    Do NOT use for: destructive system commands, network attacks, or anything illegal.
    """
    if _is_dangerous(command):
        return "BLOCKED: command matches dangerous pattern. Refusing to execute."

    try:
        # Try to run inside sandbox container
        docker_cmd = [
            "docker", "exec", SANDBOX_CONTAINER,
            "sh", "-c", command,
        ]
        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        output = result.stdout + result.stderr
        if len(output) > MAX_OUTPUT:
            output = output[:MAX_OUTPUT] + f"\n... (truncated, {len(output)} total chars)"

        status = f"[exit {result.returncode}]"
        return f"{status}\n{output}" if output else status

    except FileNotFoundError:
        return "Docker not available — cannot execute terminal command in sandbox."
    except subprocess.TimeoutExpired:
        return f"Command timed out after {TIMEOUT_SECONDS}s."
    except Exception as exc:
        log.warning("Terminal tool error: %s", exc)
        return f"Error: {exc}"


@tool
def read_file(path: str) -> str:
    """Read a file from the AI OS sandbox container. Path must be absolute."""
    if not path.startswith("/"):
        return "Error: path must be absolute (start with /)"

    try:
        result = subprocess.run(
            ["docker", "exec", SANDBOX_CONTAINER, "cat", path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        content = result.stdout
        if result.returncode != 0:
            return f"Error reading file: {result.stderr.strip()}"
        if len(content) > MAX_OUTPUT:
            content = content[:MAX_OUTPUT] + f"\n... (truncated)"
        return content
    except FileNotFoundError:
        return "Docker not available."
    except Exception as exc:
        return f"Error: {exc}"


@tool
def write_file(path: str, content: str) -> str:
    """Write content to a file inside the AI OS sandbox container."""
    if not path.startswith("/"):
        return "Error: path must be absolute (start with /)"
    if len(content) > 100_000:
        return "Error: content too large (max 100KB)"

    try:
        # Write via stdin to avoid shell injection
        result = subprocess.run(
            ["docker", "exec", "-i", SANDBOX_CONTAINER, "tee", path],
            input=content,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return f"Error writing file: {result.stderr.strip()}"
        return f"Written {len(content)} bytes to {path}"
    except FileNotFoundError:
        return "Docker not available."
    except Exception as exc:
        return f"Error: {exc}"
