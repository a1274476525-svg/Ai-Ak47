"""Security Agent — OWASP-based vulnerability analysis and remediation."""
from __future__ import annotations

import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from typing import Annotated, TypedDict

from ..testing.prompts import SECURITY_SYSTEM_PROMPT

log = logging.getLogger(__name__)


class SecurityState(TypedDict):
    messages: Annotated[list, add_messages]
    tokens_in: int
    tokens_out: int
    model: str


class SecurityAgent:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self.model_name = model
        self._llm = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=8192,
            temperature=0.1,    # very deterministic for security findings
        )
        self._graph = self._build()

    async def _analyze(self, state: SecurityState) -> dict:
        messages = [SystemMessage(content=SECURITY_SYSTEM_PROMPT)] + state["messages"]
        response = await self._llm.ainvoke(messages)
        usage = response.usage_metadata or {}
        return {
            "messages": [response],
            "tokens_in": state["tokens_in"] + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    def _build(self):
        g = StateGraph(SecurityState)
        g.add_node("analyze", self._analyze)
        g.set_entry_point("analyze")
        g.add_edge("analyze", END)
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
