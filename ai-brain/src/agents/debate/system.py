"""
AI Debate System — reduces hallucination by making models critique each other.

Flow:
  START
    ↓
  [initial_answer]  — Primary model generates answer (Claude)
    ↓
  [critique]        — Critic model finds weaknesses (GPT or Gemini)
    ↓
  [fact_check]      — Third model verifies claims (Gemini or GPT)
    ↓
  [synthesize]      — Primary model produces final answer incorporating critiques
    ↓
  END

Graceful degradation:
  - 1 provider:  skip debate, return initial answer directly
  - 2 providers: skip fact_check, do initial + critique + synthesize
  - 3+ providers: full debate pipeline
"""
from __future__ import annotations

import logging
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from ...core.providers.registry import ProviderRegistry

log = logging.getLogger(__name__)

# ─────────────────────────────────────────
# State
# ─────────────────────────────────────────

class DebateState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    original_question: str
    initial_answer: str
    critique: str
    fact_check: str
    final_answer: str
    tokens_in: int
    tokens_out: int
    providers_used: list[str]


# ─────────────────────────────────────────
# Debate System
# ─────────────────────────────────────────

class DebateSystem:
    """
    Orchestrates a structured debate between AI models.
    Falls back gracefully when fewer providers are available.
    """

    def __init__(self, registry: ProviderRegistry) -> None:
        self._registry = registry

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _call(self, provider: str, messages: list[dict], temperature: float = 0.5) -> tuple[str, int, int]:
        """Call a provider and return (content, tokens_in, tokens_out)."""
        resp = await self._registry.chat(
            messages=messages,
            preferred_provider=provider,
            temperature=temperature,
        )
        return resp.content, resp.tokens_in, resp.tokens_out

    # ── Nodes ─────────────────────────────────────────────────────────────

    async def _initial_answer(self, state: DebateState) -> dict:
        system = (
            "You are an expert assistant. Provide a thorough, accurate answer. "
            "Be specific and concrete. Acknowledge uncertainty where it exists."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": state["original_question"]},
        ]
        content, ti, to = await self._call("claude", messages, temperature=0.5)
        log.info("Debate: initial answer from claude (%d tokens)", to)
        return {
            "initial_answer": content,
            "tokens_in": state["tokens_in"] + ti,
            "tokens_out": state["tokens_out"] + to,
            "providers_used": state["providers_used"] + ["claude"],
        }

    async def _critique(self, state: DebateState) -> dict:
        system = (
            "You are a rigorous critic. Analyze the given answer for:\n"
            "1. Factual errors or inaccuracies\n"
            "2. Missing important information\n"
            "3. Logical inconsistencies\n"
            "4. Unclear or misleading statements\n\n"
            "Be specific about what is wrong and why. If the answer is fully correct, say 'No significant issues found.'"
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (
                f"Original question: {state['original_question']}\n\n"
                f"Answer to critique:\n{state['initial_answer']}"
            )},
        ]
        # Use GPT for critique if available, otherwise Gemini
        critic = "gpt" if "gpt" in self._registry.available_providers() else "gemini"
        content, ti, to = await self._call(critic, messages, temperature=0.3)
        log.info("Debate: critique from %s", critic)
        return {
            "critique": content,
            "tokens_in": state["tokens_in"] + ti,
            "tokens_out": state["tokens_out"] + to,
            "providers_used": state["providers_used"] + [critic],
        }

    async def _fact_check(self, state: DebateState) -> dict:
        system = (
            "You are a fact-checker. Review the original answer and the critique. "
            "Identify which criticisms are valid and which are wrong. "
            "Also verify any specific factual claims in the original answer. "
            "Be concise: list valid issues and confirmed facts only."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (
                f"Question: {state['original_question']}\n\n"
                f"Answer: {state['initial_answer']}\n\n"
                f"Critique: {state['critique']}"
            )},
        ]
        # Use a third provider if available
        available = self._registry.available_providers()
        used = state["providers_used"]
        third = next((p for p in ["gemini", "gpt", "claude", "deepseek"] if p in available and p not in used), None)

        if not third:
            return {"fact_check": "", "providers_used": state["providers_used"]}

        content, ti, to = await self._call(third, messages, temperature=0.2)
        log.info("Debate: fact check from %s", third)
        return {
            "fact_check": content,
            "tokens_in": state["tokens_in"] + ti,
            "tokens_out": state["tokens_out"] + to,
            "providers_used": state["providers_used"] + [third],
        }

    async def _synthesize(self, state: DebateState) -> dict:
        critique_section = f"\nCritique:\n{state['critique']}" if state["critique"] else ""
        fact_section     = f"\nFact-check:\n{state['fact_check']}" if state["fact_check"] else ""

        system = (
            "You are a synthesis expert. Given an original answer and feedback from critics, "
            "produce the definitive best answer. "
            "Fix any valid issues identified, keep what was correct, "
            "and improve clarity. Do not mention the debate process — just give the best answer directly."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (
                f"Original question: {state['original_question']}\n\n"
                f"Initial answer:\n{state['initial_answer']}"
                f"{critique_section}"
                f"{fact_section}\n\n"
                "Now write the improved, definitive answer:"
            )},
        ]
        content, ti, to = await self._call("claude", messages, temperature=0.4)
        log.info("Debate: synthesis complete. Providers used: %s", state["providers_used"])
        return {
            "final_answer": content,
            "tokens_in": state["tokens_in"] + ti,
            "tokens_out": state["tokens_out"] + to,
        }

    # ── Routing ───────────────────────────────────────────────────────────

    def _after_critique(self, state: DebateState) -> str:
        """Skip fact_check if we only have 2 providers."""
        available = self._registry.available_providers()
        used = set(state["providers_used"])
        has_third = any(p in available and p not in used for p in ["gemini", "gpt", "claude", "deepseek"])
        return "fact_check" if has_third else "synthesize"

    # ── Graph ─────────────────────────────────────────────────────────────

    def _build(self):
        g = StateGraph(DebateState)
        g.add_node("initial_answer", self._initial_answer)
        g.add_node("critique",       self._critique)
        g.add_node("fact_check",     self._fact_check)
        g.add_node("synthesize",     self._synthesize)

        g.set_entry_point("initial_answer")
        g.add_edge("initial_answer", "critique")
        g.add_conditional_edges("critique", self._after_critique, {
            "fact_check": "fact_check",
            "synthesize": "synthesize",
        })
        g.add_edge("fact_check", "synthesize")
        g.add_edge("synthesize", END)
        return g.compile()

    # ── Public API ────────────────────────────────────────────────────────

    async def run(self, question: str, messages: list[dict] | None = None) -> dict:
        """
        Run the debate. If only 1 provider is available, returns a direct answer.
        Always returns the same dict shape as other agents.
        """
        available = self._registry.available_providers()

        # With only 1 provider — no debate possible
        if len(available) < 2:
            log.info("Debate: only 1 provider available (%s) — skipping debate", available)
            resp = await self._registry.chat(
                messages=[{"role": "user", "content": question}],
                task_type="general",
            )
            return {
                "content": resp.content,
                "model": resp.model,
                "tokens_in": resp.tokens_in,
                "tokens_out": resp.tokens_out,
                "debate_used": False,
                "providers_used": [resp.provider],
            }

        graph = self._build()
        initial: DebateState = {
            "messages": [HumanMessage(content=question)],
            "original_question": question,
            "initial_answer": "",
            "critique": "",
            "fact_check": "",
            "final_answer": "",
            "tokens_in": 0,
            "tokens_out": 0,
            "providers_used": [],
        }

        result = await graph.ainvoke(initial)

        return {
            "content": result["final_answer"] or result["initial_answer"],
            "model": "debate-synthesis",
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
            "debate_used": True,
            "providers_used": result["providers_used"],
            "initial_answer": result["initial_answer"],
            "critique": result["critique"],
        }
