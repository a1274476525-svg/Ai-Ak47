"""
Autonomous Planner — decomposes a high-level goal into executable tasks.

LangGraph flow:
  START → analyze → decompose → validate → END

Output: structured plan with ordered, dependency-aware sub-tasks.
Each task maps to an agent and can be stored in PostgreSQL.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Annotated, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

log = logging.getLogger(__name__)

AGENTS = ["coding", "research", "testing", "security", "content", "devops", "general"]

PLANNER_SYSTEM = """You are the Autonomous Planner inside AI OS.

Your job: take a high-level goal and decompose it into concrete, executable sub-tasks.

## Rules
1. Each task must be completable in under 2 hours by a single AI agent
2. Tasks must have clear, verifiable completion criteria
3. Respect dependencies — later tasks can reference earlier ones by index
4. Assign the most appropriate agent to each task
5. Order tasks so dependencies always come first

## Available Agents
- coding    → write/debug/refactor code, design APIs, create schemas
- research  → search web, analyze information, summarize docs
- testing   → write unit/integration tests, coverage analysis
- security  → vulnerability analysis, security review, threat modeling
- content   → write docs, blog posts, README, marketing copy
- devops    → Docker, CI/CD, deployment scripts, infrastructure
- general   → analysis, planning, decisions that don't fit others

## Output Format (strict JSON)
{
  "goal": "<original goal>",
  "breakdown": "<1-2 sentence strategy>",
  "estimated_total_minutes": <number>,
  "tasks": [
    {
      "index": 0,
      "title": "<imperative title, max 80 chars>",
      "description": "<what exactly to do and what success looks like>",
      "agent": "<agent name>",
      "priority": <1-10>,
      "depends_on": [],
      "estimated_minutes": <number>
    }
  ]
}

IMPORTANT: Respond with ONLY the JSON object. No markdown, no explanation."""


@dataclass
class PlannedTask:
    index: int
    title: str
    description: str
    agent: str
    priority: int
    depends_on: list[int] = field(default_factory=list)
    estimated_minutes: int = 30


@dataclass
class ExecutionPlan:
    goal: str
    breakdown: str
    estimated_total_minutes: int
    tasks: list[PlannedTask]

    def to_dict(self) -> dict:
        return {
            "goal": self.goal,
            "breakdown": self.breakdown,
            "estimated_total_minutes": self.estimated_total_minutes,
            "tasks": [
                {
                    "index": t.index,
                    "title": t.title,
                    "description": t.description,
                    "agent": t.agent,
                    "priority": t.priority,
                    "depends_on": t.depends_on,
                    "estimated_minutes": t.estimated_minutes,
                }
                for t in self.tasks
            ],
        }


# ─────────────────────────────────────────
# State
# ─────────────────────────────────────────

class PlannerState(TypedDict):
    messages: Annotated[list, add_messages]
    goal: str
    raw_plan: str
    refined_plan: str
    tokens_in: int
    tokens_out: int


# ─────────────────────────────────────────
# Planner
# ─────────────────────────────────────────

class Planner:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self.model_name = model
        self._llm = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=4096,
            temperature=0.3,
        )
        self._graph = self._build()

    # ── Nodes ─────────────────────────────

    async def _analyze(self, state: PlannerState) -> dict:
        """Understand the goal and think about the approach."""
        analysis_prompt = (
            f"Goal: {state['goal']}\n\n"
            "Before decomposing, briefly answer:\n"
            "1. What is the core deliverable?\n"
            "2. What are the main technical challenges?\n"
            "3. What dependencies or phases exist?\n"
            "4. Which agents/tools are needed?\n\n"
            "Be concise (5-8 sentences total)."
        )
        response = await self._llm.ainvoke([HumanMessage(content=analysis_prompt)])
        usage = response.usage_metadata or {}
        return {
            "messages": [response],
            "tokens_in":  state["tokens_in"]  + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    async def _decompose(self, state: PlannerState) -> dict:
        """Generate the full task breakdown as JSON."""
        analysis = next(
            (str(m.content) for m in reversed(state["messages"]) if isinstance(m, AIMessage)),
            "",
        )
        decompose_prompt = (
            f"Goal: {state['goal']}\n\n"
            f"Analysis:\n{analysis}\n\n"
            "Now produce the complete execution plan as JSON following the format in your instructions."
        )
        messages = [
            SystemMessage(content=PLANNER_SYSTEM),
            HumanMessage(content=decompose_prompt),
        ]
        response = await self._llm.ainvoke(messages)
        usage = response.usage_metadata or {}
        return {
            "messages": [response],
            "raw_plan": str(response.content),
            "tokens_in":  state["tokens_in"]  + usage.get("input_tokens", 0),
            "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
        }

    async def _validate(self, state: PlannerState) -> dict:
        """Parse, validate, and fix the JSON if needed."""
        raw = state["raw_plan"].strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        try:
            data = json.loads(raw)
            # Normalise agent names
            for task in data.get("tasks", []):
                if task.get("agent") not in AGENTS:
                    task["agent"] = "general"
            return {"refined_plan": json.dumps(data)}
        except json.JSONDecodeError:
            log.warning("Planner JSON parse error — asking for fix")
            fix_prompt = (
                f"This JSON is malformed:\n{raw}\n\n"
                "Return the corrected JSON only. No markdown."
            )
            response = await self._llm.ainvoke([HumanMessage(content=fix_prompt)])
            usage = response.usage_metadata or {}
            return {
                "refined_plan": str(response.content).strip(),
                "tokens_in":  state["tokens_in"]  + usage.get("input_tokens", 0),
                "tokens_out": state["tokens_out"] + usage.get("output_tokens", 0),
            }

    # ── Graph ─────────────────────────────

    def _build(self):
        g = StateGraph(PlannerState)
        g.add_node("analyze",    self._analyze)
        g.add_node("decompose",  self._decompose)
        g.add_node("validate",   self._validate)
        g.set_entry_point("analyze")
        g.add_edge("analyze",   "decompose")
        g.add_edge("decompose", "validate")
        g.add_edge("validate",  END)
        return g.compile()

    # ── Public API ────────────────────────

    async def plan(self, goal: str) -> ExecutionPlan:
        log.info("Planner: decomposing goal → '%s'", goal[:80])
        result = await self._graph.ainvoke({
            "messages": [],
            "goal": goal,
            "raw_plan": "",
            "refined_plan": "",
            "tokens_in": 0,
            "tokens_out": 0,
        })

        data = json.loads(result["refined_plan"])
        tasks = [
            PlannedTask(
                index=t.get("index", i),
                title=t["title"],
                description=t.get("description", ""),
                agent=t.get("agent", "general"),
                priority=t.get("priority", 5),
                depends_on=t.get("depends_on", []),
                estimated_minutes=t.get("estimated_minutes", 30),
            )
            for i, t in enumerate(data.get("tasks", []))
        ]

        plan = ExecutionPlan(
            goal=data.get("goal", goal),
            breakdown=data.get("breakdown", ""),
            estimated_total_minutes=data.get("estimated_total_minutes", 0),
            tasks=tasks,
        )
        log.info("Planner: %d tasks generated (~%d min total)", len(tasks), plan.estimated_total_minutes)
        return plan

    async def plan_and_store(self, goal: str) -> tuple[ExecutionPlan, list[str]]:
        """Plan a goal and persist all tasks to PostgreSQL. Returns (plan, task_ids)."""
        from ..db.postgres import create_task

        plan = await self.plan(goal)
        task_ids: list[str] = []
        index_to_id: dict[int, str] = {}

        for task in plan.tasks:
            parent_id = index_to_id.get(task.depends_on[0]) if task.depends_on else None
            task_id = await create_task(
                title=task.title,
                description=task.description,
                origin="autonomous",
                assigned_agent=task.agent,
                priority=task.priority,
                parent_task_id=parent_id,
                metadata={"depends_on": task.depends_on, "estimated_minutes": task.estimated_minutes},
            )
            index_to_id[task.index] = task_id
            task_ids.append(task_id)

        log.info("Planner: %d tasks stored in PostgreSQL", len(task_ids))
        return plan, task_ids
