import time
from typing import AsyncIterator
import anthropic
from .base import BaseProvider, LLMResponse


class AnthropicProvider(BaseProvider):
    name = "claude"
    DEFAULT_MODEL = "claude-sonnet-4-6"

    def __init__(self, api_key: str) -> None:
        self._key = api_key
        self._client: anthropic.AsyncAnthropic | None = None

    def is_available(self) -> bool:
        return bool(self._key)

    def _client_lazy(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=self._key)
        return self._client

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        model = model or self.DEFAULT_MODEL

        # Anthropic requires system messages to be separate
        system_parts: list[str] = []
        conversation: list[dict] = []
        for msg in messages:
            if msg["role"] == "system":
                system_parts.append(msg["content"])
            else:
                conversation.append({"role": msg["role"], "content": msg["content"]})

        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": conversation,
        }
        if system_parts:
            kwargs["system"] = "\n\n".join(system_parts)

        start = time.monotonic()
        response = await self._client_lazy().messages.create(**kwargs)
        duration_ms = int((time.monotonic() - start) * 1000)

        return LLMResponse(
            content=response.content[0].text,
            provider=self.name,
            model=model,
            tokens_in=response.usage.input_tokens,
            tokens_out=response.usage.output_tokens,
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

        system_parts: list[str] = []
        conversation: list[dict] = []
        for msg in messages:
            if msg["role"] == "system":
                system_parts.append(msg["content"])
            else:
                conversation.append({"role": msg["role"], "content": msg["content"]})

        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": conversation,
        }
        if system_parts:
            kwargs["system"] = "\n\n".join(system_parts)

        start = time.monotonic()
        async with self._client_lazy().messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield {"delta": text}
            final = await stream.get_final_message()

        yield {
            "done": True,
            "provider": self.name,
            "model": model,
            "tokens_in": final.usage.input_tokens,
            "tokens_out": final.usage.output_tokens,
            "duration_ms": int((time.monotonic() - start) * 1000),
        }
