"""
Tests for ProviderRegistry provider resolution/fallback (src/core/providers/registry.py).

_resolve() decides which configured provider actually handles a request —
respecting an explicit preference, the task-type default, and finally the
global FALLBACK_CHAIN. Getting this wrong silently routes requests to the
wrong (or no) model, so it's worth locking down with tests.
"""
from __future__ import annotations

import pytest

from src.core.providers.registry import ProviderRegistry


class FakeSettings:
    """Minimal settings stub — only the provider API-key fields registry.py reads."""

    def __init__(self, **keys):
        self.anthropic_api_key = keys.get("claude", "")
        self.openai_api_key    = keys.get("gpt", "")
        self.deepseek_api_key  = keys.get("deepseek", "")
        self.mistral_api_key   = keys.get("mistral", "")
        self.google_api_key    = keys.get("gemini", "")
        self.grok_api_key      = keys.get("grok", "")


def test_resolves_task_type_default_provider():
    registry = ProviderRegistry(FakeSettings(claude="k1", gpt="k2"))
    provider = registry._resolve(task_type="coding", preferred=None)
    assert provider.name == "claude"  # TASK_PROVIDER_MAP["coding"] == "claude"


def test_preferred_provider_wins_over_task_default():
    registry = ProviderRegistry(FakeSettings(claude="k1", gpt="k2"))
    provider = registry._resolve(task_type="coding", preferred="gpt")
    assert provider.name == "gpt"


def test_falls_back_when_preferred_unavailable():
    registry = ProviderRegistry(FakeSettings(claude="k1"))
    # "gpt" preferred but not configured -> falls back to task default (claude)
    provider = registry._resolve(task_type="coding", preferred="gpt")
    assert provider.name == "claude"


def test_falls_back_through_chain_when_task_default_unavailable():
    # "research" -> gemini by default, but only deepseek is configured.
    registry = ProviderRegistry(FakeSettings(deepseek="k1"))
    provider = registry._resolve(task_type="research", preferred=None)
    assert provider.name == "deepseek"


def test_raises_when_nothing_configured():
    registry = ProviderRegistry(FakeSettings())
    with pytest.raises(RuntimeError):
        registry._resolve(task_type="general", preferred=None)


def test_available_providers_lists_only_configured():
    registry = ProviderRegistry(FakeSettings(claude="k1", mistral="k2"))
    assert sorted(registry.available_providers()) == ["claude", "mistral"]
