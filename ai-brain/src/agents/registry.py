"""
Agent Registry — single point of dispatch for all task types.

  task_type → agent
  ─────────────────────────────────────
  coding    → CodingAgent   (LangGraph: analyze→generate→review)
  testing   → TestingAgent  (LangGraph: generate_tests)
  security  → SecurityAgent (LangGraph: analyze)
  research  → ResearchAgent (LangGraph ReAct: web_search tools)
  creative  → ContentAgent  (LangGraph: write)
  general   → DebateSystem  (if >1 provider) or direct provider
  *         → direct provider chat (ProviderRegistry)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .coding.agent        import CodingAgent
from .research.agent      import ResearchAgent
from .testing.agent       import TestingAgent
from .security.agent      import SecurityAgent
from .content.agent       import ContentAgent
from .debate.system       import DebateSystem
from .coding_brain.brain  import CodingBrain
from ..core.providers.registry import ProviderRegistry
from ..core.router import TaskType

if TYPE_CHECKING:
    from ..core.memory.qdrant_store import MemoryStore

log = logging.getLogger(__name__)


class AgentRegistry:
    """Initialises all agents and dispatches tasks to the right one."""

    def __init__(self, settings, provider_registry: ProviderRegistry) -> None:
        self._registry  = provider_registry
        self._settings  = settings
        self._memory: "MemoryStore | None" = None

        ak  = settings.anthropic_api_key
        gpt = settings.openai_api_key

        self.coding        = CodingAgent(ak,  model=settings.model_coding)  if ak  else None
        self.research      = ResearchAgent(ak, model=settings.model_coding)  if ak  else None
        self.testing       = TestingAgent(ak,  model=settings.model_testing) if ak  else None
        self.security      = SecurityAgent(ak, model=settings.model_security) if ak else None
        self.coding_brain  = CodingBrain(ak,   model=settings.model_coding)  if ak  else None

        # Content agent prefers GPT but falls back to Claude
        if gpt:
            self.content = ContentAgent(gpt, model=settings.model_creative)
        elif ak:
            self.content = ContentAgent(ak,  model=settings.model_coding)
        else:
            self.content = None

        self.debate = DebateSystem(provider_registry)

        log.info(
            "AgentRegistry ready | coding=%s research=%s testing=%s security=%s content=%s coding_brain=%s",
            bool(self.coding), bool(self.research), bool(self.testing),
            bool(self.security), bool(self.content), bool(self.coding_brain),
        )

    def set_memory(self, memory: "MemoryStore") -> None:
        self._memory = memory

    async def run(
        self,
        messages: list[dict],
        task_type: TaskType,
        preferred_provider: str | None = None,
        use_debate: bool = False,
    ) -> dict:
        """Dispatch to the appropriate agent and return a unified response dict."""

        from ..core.budget import check_budget
        await check_budget()

        # Force a specific provider → bypass agent, go direct
        if preferred_provider:
            resp = await self._registry.chat(
                messages=messages,
                task_type=task_type,
                preferred_provider=preferred_provider,
            )
            return {
                "content":    resp.content,
                "provider":   resp.provider,
                "model":      resp.model,
                "tokens_in":  resp.tokens_in,
                "tokens_out": resp.tokens_out,
                "agent_used": "direct",
                "debate_used": False,
            }

        # Debate mode (general questions with multiple providers)
        if use_debate or (task_type == "general" and len(self._registry.available_providers()) > 1):
            question = next(
                (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
            )
            result = await self.debate.run(question=question, messages=messages)
            return {**result, "provider": "debate", "agent_used": "debate"}

        # Coding Brain — multi-agent mode for complex software tasks
        if task_type == "coding_brain" and self.coding_brain:
            result = await self.coding_brain.run(messages, task_type="default")
            return {
                "content":    result["content"],
                "provider":   "claude",
                "model":      self._settings.model_coding,
                "tokens_in":  result.get("tokens_in", 0),
                "tokens_out": result.get("tokens_out", 0),
                "agent_used": "coding_brain",
                "debate_used": False,
                "sub_results": result.get("sub_results", []),
            }

        # Route to specialised agent
        agent_map = {
            "coding":   self.coding,
            "testing":  self.testing,
            "security": self.security,
            "research": self.research,
            "creative": self.content,
        }

        agent = agent_map.get(task_type)

        if agent is None:
            log.info("No agent for task_type=%s — falling back to direct provider", task_type)
            resp = await self._registry.chat(messages=messages, task_type=task_type)
            return {
                "content":    resp.content,
                "provider":   resp.provider,
                "model":      resp.model,
                "tokens_in":  resp.tokens_in,
                "tokens_out": resp.tokens_out,
                "agent_used": "direct",
                "debate_used": False,
            }

        # Research agent also saves to memory
        if task_type == "research" and self.research:
            result = await self.research.run(messages, memory_store=self._memory)
        else:
            result = await agent.run(messages)

        return {
            "content":    result["content"],
            "provider":   "claude",
            "model":      result.get("model", ""),
            "tokens_in":  result.get("tokens_in", 0),
            "tokens_out": result.get("tokens_out", 0),
            "agent_used": task_type,
            "debate_used": False,
        }
