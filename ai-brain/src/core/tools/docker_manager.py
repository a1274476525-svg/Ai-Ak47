"""
Docker Manager tool — manage containers from within the AI OS brain.

Capabilities:
  - List running containers
  - Get container logs
  - Start / stop a named container
  - Get container stats (CPU, memory)

Safety constraints:
  - Can only manage containers with the 'aios_' prefix (part of AI OS stack)
  - Cannot remove containers or volumes
  - Read-only operations allowed on any container
"""
from __future__ import annotations

import logging
import subprocess
import json
from langchain_core.tools import tool

log = logging.getLogger(__name__)

ALLOWED_PREFIX = "aios_"
MAX_LOG_LINES  = 100


def _run_docker(*args: str, timeout: int = 15) -> tuple[int, str]:
    try:
        result = subprocess.run(
            ["docker", *args],
            capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except FileNotFoundError:
        return -1, "Docker CLI not found"
    except subprocess.TimeoutExpired:
        return -1, "Docker command timed out"
    except Exception as exc:
        return -1, str(exc)


@tool
def list_containers(all_containers: bool = False) -> str:
    """List Docker containers. Pass all_containers=True to include stopped ones."""
    args = ["ps", "--format", "json"]
    if all_containers:
        args.insert(1, "-a")
    rc, out = _run_docker(*args)
    if rc != 0:
        return f"Error: {out}"
    lines = [l for l in out.split("\n") if l.strip()]
    containers = []
    for line in lines:
        try:
            c = json.loads(line)
            containers.append({
                "id":      c.get("ID", ""),
                "name":    c.get("Names", ""),
                "image":   c.get("Image", ""),
                "status":  c.get("Status", ""),
                "ports":   c.get("Ports", ""),
            })
        except Exception:
            pass
    if not containers:
        return "No containers found"
    return json.dumps(containers, indent=2)


@tool
def get_container_logs(container_name: str, lines: int = 50) -> str:
    """Get the last N log lines from a Docker container (any aios_ container or by name)."""
    lines = min(lines, MAX_LOG_LINES)
    rc, out = _run_docker("logs", "--tail", str(lines), container_name)
    if rc != 0:
        return f"Error getting logs: {out}"
    return out or "(no logs)"


@tool
def get_container_stats(container_name: str) -> str:
    """Get CPU and memory stats for a running container."""
    rc, out = _run_docker(
        "stats", "--no-stream", "--format",
        "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}",
        container_name,
    )
    if rc != 0:
        return f"Error: {out}"
    return out


@tool
def restart_aios_service(service_name: str) -> str:
    """
    Restart an AI OS service container (must start with 'aios_').
    Valid names: aios_brain, aios_gateway, aios_dashboard, etc.
    """
    if not service_name.startswith(ALLOWED_PREFIX):
        return f"Error: can only restart containers with prefix '{ALLOWED_PREFIX}'"

    rc, out = _run_docker("restart", service_name, timeout=60)
    if rc != 0:
        return f"Error restarting {service_name}: {out}"
    return f"Restarted {service_name} successfully"
