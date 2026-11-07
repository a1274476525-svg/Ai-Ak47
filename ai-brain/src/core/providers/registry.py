import logging
from typing import AsyncIterator
from ..router import TASK_PROVIDER_MAP, FALLBACK_CHAIN, TaskType
from .base import BaseProvider, LLMResponse
from .anthropic import AnthropicProvider
from .openai import OpenAIProvider
from .gemini import GeminiProvider

log = logging.getLogger(__name__)


class ProviderRegistry:
    """Holds all configured providers and routes tasks to the right one."""

    def __init__(self, settings) -> None:  # type: ignore[no-untyped-def]
        self._providers: dict[str, BaseProvider] = {}

        if settings.anthropic_api_key:
            self._providers["claude"] = AnthropicProvider(settings.anthropic_api_key)
            log.info("Provider registered: claude")

        if settings.openai_api_key:
            self._providers["gpt"] = OpenAIProvider(settings.openai_api_key)
            log.info("Provider registered: gpt")

        # DeepSeek uses OpenAI-compatible API
        if settings.deepseek_api_key:
            self._providers["deepseek"] = OpenAIProvider(
                api_key=settings.deepseek_api_key,
                base_url="https://api.deepseek.com/v1",
                name="deepseek",
                default_model="deepseek-chat",
            )
            log.info("Provider registered: deepseek")

        # Mistral uses OpenAI-compatible API
        if settings.mistral_api_key:
            self._providers["mistral"] = OpenAIProvider(
                api_key=settings.mistral_api_key,
                base_url="https://api.mistral.ai/v1",
                name="mistral",
                default_model="mistral-large-latest",
            )
            log.info("Provider registered: mistral")

        # Gemini via Google's OpenAI-compatible endpoint
        if settings.google_api_key:
            self._providers["gemini"] = GeminiProvider(settings.google_api_key)
            log.info("Provider registered: gemini")

        # Grok via xAI OpenAI-compatible API
        if settings.grok_api_key:
            self._providers["grok"] = OpenAIProvider(
                api_key=settings.grok_api_key,
                base_url="https://api.x.ai/v1",
                name="grok",
                default_model="grok-2-latest",
            )
            log.info("Provider registered: grok")

        if not self._providers:
            log.warning("No AI providers configured — set at least ANTHROPIC_API_KEY")

    def available_providers(self) -> list[str]:
        return [name for name, p in self._providers.items() if p.is_available()]

    def _resolve(self, task_type: TaskType, preferred: str | None) -> BaseProvider:
        """Return the first available provider, respecting preference and fallback chain."""
        candidates: list[str] = []

        if preferred:
            candidates.append(preferred)

        task_pref = TASK_PROVIDER_MAP.get(task_type, "claude")
        if task_pref not in candidates:
            candidates.append(task_pref)

        for name in FALLBACK_CHAIN:
            if name not in candidates:
                candidates.append(name)

        for name in candidates:
            provider = self._providers.get(name)
            if provider and provider.is_available():
                if name != (preferred or task_pref):
                    log.info("Routing to fallback provider: %s (wanted: %s)", name, preferred or task_pref)
                return provider

        raise RuntimeError(
            f"No available provider for task_type={task_type}. "
            f"Tried: {candidates}. Configured: {list(self._providers)}"
        )

    async def chat(
        self,
        messages: list[dict],
        task_type: TaskType = "general",
        preferred_provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        provider = self._resolve(task_type, preferred_provider)
        log.debug("Dispatching to provider=%s task_type=%s", provider.name, task_type)
        return await provider.chat(messages, model=model, max_tokens=max_tokens, temperature=temperature)

    async def stream_chat(
        self,
        messages: list[dict],
        task_type: TaskType = "general",
        preferred_provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[dict]:
        provider = self._resolve(task_type, preferred_provider)
        log.debug("Streaming from provider=%s task_type=%s", provider.name, task_type)
        async for chunk in provider.stream_chat(messages, model=model, max_tokens=max_tokens, temperature=temperature):
            yield chunk
