"""
Shared streaming implementation for any OpenAI-compatible client
(OpenAI, DeepSeek, Mistral, Grok, Gemini's OpenAI-compat endpoint).
"""
from __future__ import annotations

import time
from typing import Any, AsyncIterator


async def stream_openai_compatible(
    client: Any,
    provider_name: str,
    messages: list[dict],
    model: str,
    max_tokens: int,
    temperature: float,
) -> AsyncIterator[dict]:
    start = time.monotonic()
    tokens_in = 0
    tokens_out = 0

    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
            stream_options={"include_usage": True},
        )
    except Exception:
        # Some OpenAI-compatible endpoints (DeepSeek/Mistral/Grok/Gemini) reject
        # stream_options — retry without it; usage will be reported as 0.
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

    async for chunk in stream:
        if chunk.usage:
            tokens_in = chunk.usage.prompt_tokens or 0
            tokens_out = chunk.usage.completion_tokens or 0
        if chunk.choices:
            delta = chunk.choices[0].delta.content
            if delta:
                yield {"delta": delta}

    yield {
        "done": True,
        "provider": provider_name,
        "model": model,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "duration_ms": int((time.monotonic() - start) * 1000),
    }
