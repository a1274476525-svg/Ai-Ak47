"""
Coding Agent — LangGraph implementation.

Graph:
  START → analyze → generate → review → END

- analyze:  Understands the task and builds a plan (fast, low-temp)
- generate: Writes the actual code based on the plan
- review:   Self-reviews for bugs, edge cases, style issues
            If issues found → loops back to generate (max 1 retry)
"""
from __future__ import annotations

import logging
from typing import Annotated, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .prompts import CODING_SYSTEM_PROMPT

log = logging.getLogger(__name__)

# ─────────────────────────────────────────
# State
# ─────────────────────────────────────────

class CodingState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    plan: str
    retries: int
    tokens_in: int
    tokens_out: int
    model: str


# ─────────────────────────────────────────
# Agent
# ─────────────────────────────────────────

class CodingAgent:
    MAX_RETRIES = 1

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self.model_name = model

        self._planner = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=512,
            temperature=0.2,   # deterministic planning
        )
        self._coder = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=8192,
            temperature=0.5,
        )
        self._reviewer = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=1024,
            temperature=0.1,
        )

        self._graph = self._build()

    # ── Nodes ─────────────────────────────

    async def _analyze(self, state: CodingState) -> dict:
        """Extract a brief implementation plan from the user request."""
        last_human = next(
            (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
            "",
        )

        plan_prompt = (
            "In 3-5 bullet points, outline the implementation plan for this task. "
            "Be concrete — mention specific functions, data structures, or patterns to use. "
            "Do NOT write code yet.\n\nTask:\n" + str(last_human)
        )

        response = await self._planner.ainvoke([HumanMessage(content=plan_prompt)])
        usage = response.usage_metadata or {}

        log.debug("Plan:\n%s", response.content)
        return {
            "plan": response.content,
            "tokens_in": state["tokens_in"] + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    async def _generate(self, state: CodingState) -> dict:
        """Generate code using the plan as additional context."""
        system = SystemMessage(content=CODING_SYSTEM_PROMPT)
        plan_ctx = SystemMessage(
            content=f"Implementation plan to follow:\n{state['plan']}"
        )
        messages = [system, plan_ctx] + state["messages"]

        response = await self._coder.ainvoke(messages)
        usage = response.usage_metadata or {}

        return {
            "messages": [response],
            "tokens_in": state["tokens_in"] + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    async def _review(self, state: CodingState) -> dict:
        """Self-review the generated code. Return issues or 'LGTM'."""
        last_code = next(
            (m.content for m in reversed(state["messages"]) if isinstance(m, AIMessage)),
            "",
        )

        review_prompt = (
            "Review the following code for: bugs, missing error handling, security issues, "
            "or violations of the original requirement.\n"
            "If everything is correct, respond with exactly: LGTM\n"
            "Otherwise, list specific issues (max 3) that must be fixed.\n\n"
            f"Code to review:\n{last_code}"
        )

        response = await self._reviewer.ainvoke([HumanMessage(content=review_prompt)])
        usage = response.usage_metadata or {}
        review_text = str(response.content).strip()

        log.debug("Review result: %s", review_text[:100])
        return {
            "messages": [AIMessage(content=f"[Review]: {review_text}")],
            "tokens_in": state["tokens_in"] + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    # ── Routing ───────────────────────────

    def _should_retry(self, state: CodingState) -> str:
        """Route: if review found issues and we haven't retried → fix; else → end."""
        if state["retries"] >= self.MAX_RETRIES:
            return END

        last_review = next(
            (m.content for m in reversed(state["messages"]) if isinstance(m, AIMessage) and str(m.content).startswith("[Review]:")),
            "LGTM",
        )
        review_text = str(last_review).replace("[Review]:", "").strip()

        if review_text.upper() == "LGTM":
            return END

        log.info("Issues found in review — regenerating (retry %d)", state["retries"] + 1)
        return "generate"

    # ── Graph ─────────────────────────────

    def _build(self):
        g = StateGraph(CodingState)

        g.add_node("analyze",  self._analyze)
        g.add_node("generate", self._generate)
        g.add_node("review",   self._review)

        g.set_entry_point("analyze")
        g.add_edge("analyze",  "generate")
        g.add_edge("generate", "review")
        g.add_conditional_edges("review", self._should_retry, {"generate": "generate", END: END})

        return g.compile()

    # ── Public API ────────────────────────

    async def run(self, messages: list[dict]) -> dict:
        lc_messages: list[BaseMessage] = []
        for msg in messages:
            if msg["role"] == "user":
                lc_messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))

        initial: CodingState = {
            "messages": lc_messages,
            "plan": "",
            "retries": 0,
            "tokens_in": 0,
            "tokens_out": 0,
            "model": self.model_name,
        }

        result = await self._graph.ainvoke(initial)

        # Last AI message that is NOT a review comment
        final_content = ""
        for msg in reversed(result["messages"]):
            if isinstance(msg, AIMessage) and not str(msg.content).startswith("[Review]:"):
                final_content = str(msg.content)
                break

        return {
            "content": final_content,
            "model": result["model"],
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
        }
