"""
Coding Brain — orchestrates 8 specialized sub-agents for complex software tasks.

Sub-agents:
  1. Architecture  — system design, component diagram, tech choices
  2. Backend       — API implementation, services, business logic
  3. Frontend      — UI components, pages, state management
  4. Database      — schemas, queries, migrations
  5. DevOps        — Dockerfile, CI/CD, Kubernetes, monitoring
  6. Security      — vulnerability audit, hardening recommendations
  7. QA            — unit/integration/e2e tests
  8. Docs          — README, API reference, ADRs

Flow (LangGraph):
  START → architect → [backend ‖ frontend ‖ database] → devops → [security ‖ qa ‖ docs] → synthesize → END

The flow is adaptive: steps are skipped if not needed for the task type.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Annotated, Any, Awaitable, Callable, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from .prompts import (
    ARCHITECTURE_PROMPT, BACKEND_PROMPT, FRONTEND_PROMPT,
    DATABASE_PROMPT, DEVOPS_PROMPT, SECURITY_PROMPT,
    QA_PROMPT, DOCS_PROMPT,
)

log = logging.getLogger(__name__)

# Task type → which sub-agents to activate
AGENT_MATRIX = {
    "full_stack": {"architecture", "backend", "frontend", "database", "devops", "security", "qa", "docs"},
    "backend":    {"architecture", "backend", "database", "devops", "security", "qa", "docs"},
    "frontend":   {"architecture", "frontend", "security", "qa", "docs"},
    "api":        {"architecture", "backend", "database", "security", "qa", "docs"},
    "database":   {"database", "backend", "security", "docs"},
    "devops":     {"devops", "security", "docs"},
    "audit":      {"security", "qa", "docs"},
    "default":    {"architecture", "backend", "security", "qa", "docs"},
}


@dataclass
class SubAgentResult:
    agent: str
    content: str
    tokens_in: int = 0
    tokens_out: int = 0


@dataclass
class BrainResult:
    task: str
    task_type: str
    synthesis: str
    agents_used: list[str]
    sub_results: list[SubAgentResult] = field(default_factory=list)
    tokens_in: int = 0
    tokens_out: int = 0

    @property
    def total_tokens(self) -> int:
        return self.tokens_in + self.tokens_out

    def to_dict(self) -> dict:
        return {
            "content": self.synthesis,
            "task_type": self.task_type,
            "agents_used": self.agents_used,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "sub_results": [
                {"agent": r.agent, "content": r.content[:500]}
                for r in self.sub_results
            ],
        }


# ─────────────────────────────────────────
# Graph State
# ─────────────────────────────────────────

class BrainState(TypedDict):
    messages:      Annotated[list, add_messages]
    task:          str
    task_type:     str
    active_agents: set
    architecture:  str
    backend:       str
    frontend:      str
    database:      str
    devops:        str
    security:      str
    qa:            str
    docs:          str
    synthesis:     str
    sub_results:   list
    tokens_in:     int
    tokens_out:    int
    on_step:       Any   # Callable[[str, str], Awaitable[None]] | None — invoked after each sub-agent


# ─────────────────────────────────────────
# Coding Brain
# ─────────────────────────────────────────

class CodingBrain:
    """Multi-agent coding orchestrator powered by LangGraph."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self.model_name = model
        self._llm = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=8192,
            temperature=0.2,
        )
        self._graph = self._build()

    # ── Sub-agent factory ──────────────────────────────────────────────────────

    def _make_node(self, agent_name: str, system_prompt: str):
        """Return a LangGraph node function for a specific sub-agent."""

        async def _node(state: BrainState) -> dict:
            if agent_name not in state["active_agents"]:
                return {agent_name: "", "sub_results": state["sub_results"]}

            log.info("CodingBrain: running %s agent", agent_name)

            # Build context from previous agents' outputs
            context_parts = []
            for prev in ["architecture", "backend", "frontend", "database", "devops"]:
                if prev != agent_name and state.get(prev):
                    context_parts.append(f"=== {prev.upper()} ===\n{state[prev][:2000]}")
            context = "\n\n".join(context_parts)

            user_content = f"Task: {state['task']}"
            if context:
                user_content += f"\n\nContext from previous agents:\n{context}"

            response = await self._llm.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_content),
            ])

            usage = response.usage_metadata or {}
            content = str(response.content)
            result = SubAgentResult(
                agent=agent_name,
                content=content,
                tokens_in=usage.get("input_tokens", 0),
                tokens_out=usage.get("output_tokens", 0),
            )

            on_step = state.get("on_step")
            if on_step is not None:
                try:
                    await on_step(agent_name, content[:500])
                except Exception:
                    log.warning("on_step callback failed for %s", agent_name, exc_info=True)

            return {
                agent_name:    content,
                "sub_results": state["sub_results"] + [result],
                "tokens_in":   state["tokens_in"]  + result.tokens_in,
                "tokens_out":  state["tokens_out"] + result.tokens_out,
                "messages":    [response],
            }

        _node.__name__ = f"node_{agent_name}"
        return _node

    # ── Synthesis node ────────────────────────────────────────────────────────

    async def _synthesize(self, state: BrainState) -> dict:
        log.info("CodingBrain: synthesizing results from %d agents", len(state["sub_results"]))

        sections = []
        for res in state["sub_results"]:
            sections.append(f"## {res.agent.upper()} AGENT OUTPUT\n\n{res.content}")

        synthesis_prompt = (
            f"You are a senior software architect. The following sub-agents have analyzed this task:\n\n"
            f"**Task:** {state['task']}\n\n"
            + "\n\n---\n\n".join(sections[:6])  # limit to 6 sections to avoid context overflow
            + "\n\n---\n\n"
            "Synthesize all outputs into a single, coherent, actionable response.\n"
            "Structure:\n"
            "1. Executive Summary (2-3 sentences)\n"
            "2. Architecture Overview\n"
            "3. Implementation Plan (ordered steps)\n"
            "4. Key Code Artifacts (paste the most important ones)\n"
            "5. Security & Quality checklist\n"
            "6. Next steps\n\n"
            "Be comprehensive but avoid repetition."
        )

        response = await self._llm.ainvoke([HumanMessage(content=synthesis_prompt)])
        usage = response.usage_metadata or {}

        on_step = state.get("on_step")
        if on_step is not None:
            try:
                await on_step("synthesize", str(response.content)[:500])
            except Exception:
                log.warning("on_step callback failed for synthesize", exc_info=True)

        return {
            "synthesis":  str(response.content),
            "tokens_in":  state["tokens_in"]  + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
            "messages":   [response],
        }

    # ── Graph construction ────────────────────────────────────────────────────

    def _build(self):
        g = StateGraph(BrainState)

        # Add all sub-agent nodes
        g.add_node("architecture", self._make_node("architecture", ARCHITECTURE_PROMPT))
        g.add_node("backend",      self._make_node("backend",      BACKEND_PROMPT))
        g.add_node("frontend",     self._make_node("frontend",     FRONTEND_PROMPT))
        g.add_node("database",     self._make_node("database",     DATABASE_PROMPT))
        g.add_node("devops",       self._make_node("devops",       DEVOPS_PROMPT))
        g.add_node("security",     self._make_node("security",     SECURITY_PROMPT))
        g.add_node("qa",           self._make_node("qa",           QA_PROMPT))
        g.add_node("docs",         self._make_node("docs",         DOCS_PROMPT))
        g.add_node("synthesize",   self._synthesize)

        # Flow: architecture first → parallel group 1 → devops → parallel group 2 → synthesize
        g.set_entry_point("architecture")
        g.add_edge("architecture", "backend")
        g.add_edge("architecture", "frontend")
        g.add_edge("architecture", "database")
        g.add_edge("backend",   "devops")
        g.add_edge("frontend",  "devops")
        g.add_edge("database",  "devops")
        g.add_edge("devops",    "security")
        g.add_edge("devops",    "qa")
        g.add_edge("devops",    "docs")
        g.add_edge("security",  "synthesize")
        g.add_edge("qa",        "synthesize")
        g.add_edge("docs",      "synthesize")
        g.add_edge("synthesize", END)

        return g.compile()

    # ── Public API ────────────────────────────────────────────────────────────

    def _resolve_active_agents(self, task_type: str, messages: list[dict]) -> set:
        """Determine which agents are needed based on task type and message content."""
        agents = AGENT_MATRIX.get(task_type, AGENT_MATRIX["default"]).copy()

        # Detect keywords to add/remove agents
        text = " ".join(m.get("content", "") for m in messages).lower()
        if any(kw in text for kw in ("frontend", "react", "ui", "component", "page")):
            agents.add("frontend")
        if any(kw in text for kw in ("database", "sql", "schema", "migration", "postgres")):
            agents.add("database")
        if any(kw in text for kw in ("docker", "deploy", "kubernetes", "ci/cd", "devops")):
            agents.add("devops")

        return agents

    async def run(
        self,
        messages: list[dict],
        task_type: str = "default",
        on_step: Callable[[str, str], Awaitable[None]] | None = None,
    ) -> dict:
        task = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
        )
        active = self._resolve_active_agents(task_type, messages)

        log.info(
            "CodingBrain: task_type=%s active_agents=%s task=%.60s",
            task_type, sorted(active), task,
        )

        result = await self._graph.ainvoke({
            "messages":      [HumanMessage(content=task)],
            "task":          task,
            "task_type":     task_type,
            "active_agents": active,
            "architecture":  "",
            "backend":       "",
            "frontend":      "",
            "database":      "",
            "devops":        "",
            "security":      "",
            "qa":            "",
            "docs":          "",
            "synthesis":     "",
            "sub_results":   [],
            "tokens_in":     0,
            "tokens_out":    0,
            "on_step":       on_step,
        })

        brain_result = BrainResult(
            task=task,
            task_type=task_type,
            synthesis=result["synthesis"],
            agents_used=sorted(active),
            sub_results=result["sub_results"],
            tokens_in=result["tokens_in"],
            tokens_out=result["tokens_out"],
        )

        log.info(
            "CodingBrain: done — agents=%d tokens=%d",
            len(brain_result.agents_used), brain_result.total_tokens,
        )
        return brain_result.to_dict()
