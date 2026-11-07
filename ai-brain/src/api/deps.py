"""
Singleton dependencies — initialised once at startup, injected via FastAPI Depends.
"""
from functools import lru_cache
from ..config import get_settings
from ..core.providers.registry import ProviderRegistry
from ..agents.registry import AgentRegistry
from ..core.memory.qdrant_store import MemoryStore
from ..core.knowledge_graph.graph import KnowledgeGraph


@lru_cache
def get_provider_registry() -> ProviderRegistry:
    return ProviderRegistry(get_settings())


@lru_cache
def get_memory_store() -> MemoryStore:
    s = get_settings()
    return MemoryStore(url=s.qdrant_url)


@lru_cache
def get_knowledge_graph() -> KnowledgeGraph:
    s = get_settings()
    return KnowledgeGraph(uri=s.neo4j_uri, user=s.neo4j_user, password=s.neo4j_password)


@lru_cache
def get_agent_registry() -> AgentRegistry:
    settings = get_settings()
    registry = get_provider_registry()
    return AgentRegistry(settings=settings, provider_registry=registry)
