"""
Extension Registry — discovers, loads, and manages BaseExtension plugins.

Discovery path: EXTENSIONS_DIR env var (default: ./extensions relative to CWD).
Each .py file in that directory is scanned for subclasses of BaseExtension.
"""
from __future__ import annotations

import importlib.util
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import BaseExtension

log = logging.getLogger(__name__)

_registry: dict[str, "BaseExtension"] = {}


def _extensions_dir() -> Path:
    env = os.getenv("EXTENSIONS_DIR", "extensions")
    return Path(env)


def _load_file(path: Path) -> list["BaseExtension"]:
    """Import a .py file and return all BaseExtension subclass instances found."""
    from .base import BaseExtension
    instances: list[BaseExtension] = []
    try:
        spec   = importlib.util.spec_from_file_location(path.stem, path)
        if not spec or not spec.loader:
            return instances
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)  # type: ignore[arg-type]

        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if (
                isinstance(attr, type)
                and issubclass(attr, BaseExtension)
                and attr is not BaseExtension
                and hasattr(attr, "metadata")
            ):
                instance = attr()
                instances.append(instance)
                log.info("Extension loaded: %s v%s", instance.metadata.name, instance.metadata.version)
    except Exception as exc:
        log.warning("Failed to load extension from %s: %s", path, exc)
    return instances


def discover_extensions() -> int:
    """Scan EXTENSIONS_DIR and load all valid extensions. Returns count loaded."""
    global _registry
    ext_dir = _extensions_dir()
    if not ext_dir.is_dir():
        log.info("Extensions dir not found at %s — no extensions loaded", ext_dir)
        return 0

    loaded = 0
    for py_file in sorted(ext_dir.glob("*.py")):
        if py_file.name.startswith("_"):
            continue
        for instance in _load_file(py_file):
            _registry[instance.metadata.name] = instance
            try:
                instance.on_startup()
            except Exception as exc:
                log.warning("Extension %s on_startup error: %s", instance.metadata.name, exc)
            loaded += 1

    log.info("Extensions: %d loaded", loaded)
    return loaded


def get_extension(name: str) -> "BaseExtension | None":
    return _registry.get(name)


def list_extensions() -> list[dict]:
    return [
        {
            "name":        ext.metadata.name,
            "version":     ext.metadata.version,
            "description": ext.metadata.description,
            "author":      ext.metadata.author,
            "tags":        ext.metadata.tags,
            "tools":       [t.name for t in ext.get_tools()],
            "agents":      list(ext.get_agents().keys()),
            "has_router":  ext.get_router() is not None,
        }
        for ext in _registry.values()
    ]


def reload_extensions() -> int:
    """Shut down existing extensions and reload all."""
    global _registry
    for ext in _registry.values():
        try:
            ext.on_shutdown()
        except Exception as exc:
            log.warning("Extension %s on_shutdown: %s", ext.metadata.name, exc)
    _registry.clear()
    return discover_extensions()


class ExtensionRegistry:
    """Class-based wrapper for convenience."""

    def discover(self) -> int:
        return discover_extensions()

    def reload(self) -> int:
        return reload_extensions()

    def get(self, name: str) -> "BaseExtension | None":
        return get_extension(name)

    def list(self) -> list[dict]:
        return list_extensions()

    def all_tools(self) -> list:
        tools = []
        for ext in _registry.values():
            tools.extend(ext.get_tools())
        return tools
