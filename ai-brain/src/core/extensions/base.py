"""
Extensions SDK — base classes for AI OS plugins.

An Extension can add:
  - New Tools    (callable functions the agents can use)
  - New Agents   (specialized AI agents)
  - New Routes   (FastAPI routers added at startup)
  - Hooks        (callbacks for system events)

Example extension (save as extensions/my_extension.py):

    from src.core.extensions.base import BaseExtension, ExtensionMetadata
    from langchain_core.tools import tool

    @tool
    def hello_world(name: str) -> str:
        \"\"\"Say hello.\"\"\"
        return f"Hello, {name}!"

    class MyExtension(BaseExtension):
        metadata = ExtensionMetadata(
            name="hello",
            version="1.0.0",
            description="A simple hello extension",
            author="AI OS",
        )

        def get_tools(self):
            return [hello_world]
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExtensionMetadata:
    name:        str
    version:     str
    description: str
    author:      str   = "unknown"
    tags:        list[str] = field(default_factory=list)
    requires:    list[str] = field(default_factory=list)   # other extension names


class BaseExtension(ABC):
    """Base class every AI OS extension must subclass."""

    metadata: ExtensionMetadata

    def get_tools(self) -> list[Any]:
        """Return a list of LangChain @tool functions this extension provides."""
        return []

    def get_agents(self) -> dict[str, Any]:
        """Return {agent_name: agent_instance} for new agents."""
        return {}

    def get_router(self) -> Any | None:
        """Return an optional FastAPI APIRouter to mount at /v1/ext/{extension.name}/."""
        return None

    def on_startup(self) -> None:
        """Called once when the extension is loaded."""

    def on_shutdown(self) -> None:
        """Called when the extension is unloaded."""

    def on_task_completed(self, task: dict) -> None:
        """Hook called after each task completes."""

    def run(self, action: str, params: dict) -> dict:
        """Generic action dispatcher — override for custom actions."""
        return {"error": f"Action '{action}' not implemented in {self.metadata.name}"}
