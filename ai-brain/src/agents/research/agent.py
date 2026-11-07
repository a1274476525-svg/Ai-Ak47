"""
Research Agent — LangGraph ReAct agent with web search tools.

Uses langgraph.prebuilt.create_react_agent for the tool-calling loop.
Stores findings in Qdrant memory after synthesis.
"""
from __future__ import annotations

import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from ...core.tools.web_search import web_search, web_search_news
from .prompts import RESEARCH_SYSTEM_PROMPT

log = logging.getLogger(__name__)

TOOLS = [web_search, web_search_news]


class ResearchAgent:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self.model_name = model
        llm = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=8192,
            temperature=0.3,   # lower temp for factual research
        )
        self._graph = create_react_agent(
            llm,
            tools=TOOLS,
            state_modifier=RESEARCH_SYSTEM_PROMPT,
        )

    async def run(
        self,
        messages: list[dict],
        memory_store=None,    # optional MemoryStore to save findings
    ) -> dict:
        lc_messages = []
        for msg in messages:
            if msg["role"] == "user":
                lc_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))

        result = await self._graph.ainvoke({"messages": lc_messages})

        # Get final AI response (skip tool calls)
        final_content = ""
        tokens_in = tokens_out = 0
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and isinstance(msg.content, str) and msg.content.strip():
                final_content = msg.content
                usage = msg.usage_metadata or {}
                tokens_in  += usage.get("input_tokens", 0)
                tokens_out += usage.get("output_tokens", 0)
                break

        # Store findings in memory if available
        if memory_store and final_content:
            topic = str(lc_messages[-1].content)[:100] if lc_messages else "research"
            try:
                await memory_store.store(
                    content=final_content,
                    topic=topic,
                    source="research_agent",
                )
                log.debug("Research findings stored in memory")
            except Exception as exc:
                log.warning("Failed to store research in memory: %s", exc)

        return {
            "content": final_content,
            "model": self.model_name,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }
