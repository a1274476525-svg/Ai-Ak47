"""Content Agent — creative writing, blog posts, SEO content, marketing copy."""
from __future__ import annotations

import logging
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from typing import Annotated, TypedDict

log = logging.getLogger(__name__)

CONTENT_SYSTEM_PROMPT = """You are the Content Agent inside AI OS — an expert writer and content strategist.

## Your Specialties
- Blog posts and articles (SEO-optimized, engaging, well-structured)
- Marketing copy (landing pages, ads, product descriptions)
- Technical documentation and explanations
- Social media content
- Email campaigns

## Writing Principles
- Hook the reader in the first sentence
- Use clear, active language — avoid jargon unless technical audience
- Structure: strong opening, valuable body, clear CTA or conclusion
- Adapt tone to the context (professional, casual, technical, persuasive)
- For SEO: natural keyword integration, scannable headers, meta description

## Format
Deliver the content ready to publish. No meta-commentary about "here's your content" — just the content itself.

Respond in the same language as the request."""


class ContentState(TypedDict):
    messages: Annotated[list, add_messages]
    tokens_in: int
    tokens_out: int
    model: str


class ContentAgent:
    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        self.model_name = model
        self._model_name = model
        # Determine provider from model name
        if "claude" in model:
            from langchain_anthropic import ChatAnthropic
            self._llm = ChatAnthropic(model=model, api_key=api_key, max_tokens=4096, temperature=0.8)
        else:
            from langchain_openai import ChatOpenAI
            self._llm = ChatOpenAI(model=model, api_key=api_key, max_tokens=4096, temperature=0.8)  # type: ignore

        self._graph = self._build()

    async def _write(self, state: ContentState) -> dict:
        messages = [SystemMessage(content=CONTENT_SYSTEM_PROMPT)] + state["messages"]
        response = await self._llm.ainvoke(messages)
        usage = response.usage_metadata or {}
        return {
            "messages": [response],
            "tokens_in": state["tokens_in"] + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    def _build(self):
        g = StateGraph(ContentState)
        g.add_node("write", self._write)
        g.set_entry_point("write")
        g.add_edge("write", END)
        return g.compile()

    async def run(self, messages: list[dict]) -> dict:
        lc_messages = [
            HumanMessage(content=m["content"]) if m["role"] == "user"
            else AIMessage(content=m["content"])
            for m in messages
        ]
        result = await self._graph.ainvoke({
            "messages": lc_messages,
            "tokens_in": 0,
            "tokens_out": 0,
            "model": self.model_name,
        })
        last = next(m for m in reversed(result["messages"]) if isinstance(m, AIMessage))
        return {
            "content": str(last.content),
            "model": self.model_name,
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
        }
