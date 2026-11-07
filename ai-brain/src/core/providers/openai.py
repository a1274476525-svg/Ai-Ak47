import time
from typing import AsyncIterator
from openai import AsyncOpenAI
from .base import BaseProvider, LLMResponse
from ._stream_utils import stream_openai_compatible


class OpenAIProvider(BaseProvider):
    """
    Wraps any OpenAI-compatible chat completions API. Reused as-is for
    DeepSeek/Mistral/Grok via `base_url` — pass `name`/`default_model` so
    responses are attributed to the right provider and the right default
    model is used (an OpenAI model name isn't valid on those endpoints).
    """

    DEFAULT_MODEL = "gpt-4o"

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        name: str = "gpt",
        default_model: str | None = None,
    ) -> None:
        self._key = api_key
        self._base_url = base_url
        self._client: AsyncOpenAI | None = None
        self.name = name
        if default_model:
            self.DEFAULT_MODEL = default_model

    def is_available(self) -> bool:
        return bool(self._key)

    def _client_lazy(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self._key,
                base_url=self._base_url,
            )
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
