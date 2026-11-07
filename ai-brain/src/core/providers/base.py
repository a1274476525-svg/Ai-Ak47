from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class LLMResponse:
    content: str
    provider: str
    model: str
    tokens_in: int
    tokens_out: int
    duration_ms: int
    metadata: dict = field(default_factory=dict)


class BaseProvider(ABC):
    name: str

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse: ...

    @abstractmethod
    def is_available(self) -> bool: ...

    async def stream_chat(
        self,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[dict]:
        """
        Default fallback for providers without native streaming: buffers the
        full response and emits it as a single delta. Providers with a
        streaming SDK (Anthropic, any OpenAI-compatible client) override this.
        """
        response = await self.chat(messages, model=model, max_tokens=max_tokens, temperature=temperature)
        yield {"delta": response.content}
        yield {
            "done": True,
            "provider": response.provider,
            "model": response.model,
            "tokens_in": response.tokens_in,
            "tokens_out": response.tokens_out,
            "duration_ms": response.duration_ms,
        }
