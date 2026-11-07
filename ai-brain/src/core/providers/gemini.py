import time
from typing import AsyncIterator
from .base import BaseProvider, LLMResponse
from ._stream_utils import stream_openai_compatible

# Gemini exposes an OpenAI-compatible endpoint — reuse the same pattern
class GeminiProvider(BaseProvider):
    name = "gemini"
    DEFAULT_MODEL = "gemini-2.0-flash"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

    def __init__(self, api_key: str) -> None:
        self._key = api_key
        self._client = None

    def is_available(self) -> bool:
        return bool(self._key)

    def _client_lazy(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self._key, base_url=self.BASE_URL)
        return self._client

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        model = model or self.DEFAULT_MODEL
        start = time.monotonic()

        response = await self._client_lazy().chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=max_tokens,
            temperature=temperature,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        usage = response.usage

        return LLMResponse(
            content=response.choices[0].message.content or "",
            provider=self.name,
            model=model,
            tokens_in=usage.prompt_tokens if usage else 0,
            tokens_out=usage.completion_tokens if usage else 0,
            duration_ms=duration_ms,
        )

    async def stream_chat(
        self,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[dict]:
        model = model or self.DEFAULT_MODEL
        async for chunk in stream_openai_compatible(
            self._client_lazy(), self.name, messages, model, max_tokens, temperature,
        ):
            yield chunk
