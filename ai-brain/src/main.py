"""
AI OS — Brain Service
FastAPI application with full Phase 3 capabilities.
"""
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .api.routes.health     import router as health_router
from .api.routes.chat       import router as chat_router
from .api.routes.memory     import router as memory_router
from .api.routes.autonomous import router as autonomous_router
from .api.routes.knowledge  import router as knowledge_router
from .api.routes.tools      import router as tools_router
from .api.routes.analytics  import router as analytics_router
from .api.routes.extensions import router as extensions_router
from .api.routes.budget     import router as budget_router


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        stream=sys.stdout,
    )
    for noisy in ("httpx", "anthropic", "openai", "httpcore", "hpack"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _setup_logging(settings.log_level)
    log = logging.getLogger("brain")
    log.info("AI OS Brain starting [%s] — Phase 5", settings.env)

    # ── Database Pool ──────────────────────────────────────────────────
    from .db.postgres import init_pool, close_pool
    if settings.database_url:
        try:
            await init_pool(settings.database_url)
            log.info("PostgreSQL pool ready")
        except Exception as exc:
            log.warning("PostgreSQL unavailable — DB features disabled: %s", exc)

    # ── Provider Registry ──────────────────────────────────────────────
    from .api.deps import get_provider_registry, get_memory_store, get_agent_registry
    registry = get_provider_registry()
    log.info("Providers available: %s", registry.available_providers())

    # ── Vector Memory ──────────────────────────────────────────────────
    memory = get_memory_store()
    try:
        await memory.init()
        log.info("Vector memory (Qdrant) ready")
    except Exception as exc:
        log.warning("Qdrant unavailable — memory disabled: %s", exc)

    # ── Knowledge Graph ────────────────────────────────────────────────
    from .api.deps import get_knowledge_graph
    kg = get_knowledge_graph()
    try:
        await kg.init()
        if kg.available:
            stats = await kg.get_stats()
            log.info("Knowledge Graph ready — nodes: %s", stats.get("nodes", {}))
        else:
            log.info("Knowledge Graph not available — continuing without it")
    except Exception as exc:
        log.warning("Knowledge Graph init failed: %s", exc)

    # ── Extensions ──────────────────────────────────────────────────────
    from .core.extensions.registry import discover_extensions
    try:
        ext_count = discover_extensions()
        log.info("Extensions loaded: %d", ext_count)
    except Exception as exc:
        log.warning("Extension discovery failed: %s", exc)

    # ── Agent Registry ─────────────────────────────────────────────────
    agents = get_agent_registry()
    agents.set_memory(memory)

    available_agents = [
        name for name, agent in [
            ("coding",        agents.coding),
            ("research",      agents.research),
            ("testing",       agents.testing),
            ("security",      agents.security),
            ("content",       agents.content),
            ("coding_brain",  agents.coding_brain),
        ] if agent is not None
    ]
    log.info("Agents ready: %s", available_agents)
    log.info(
        "AI Debate System: %s",
        "enabled" if len(registry.available_providers()) > 1 else "disabled (need 2+ providers)",
    )

    # ── Autonomous Scheduler ───────────────────────────────────────────
    from .autonomous.scheduler import start_scheduler, stop_scheduler
    scheduler = None
    if settings.database_url and settings.anthropic_api_key:
        try:
            scheduler = start_scheduler(
                config=settings,
                memory_store=memory,
                agent_registry=agents,
                knowledge_graph=kg,
            )
            log.info("Autonomous scheduler started")
        except Exception as exc:
            log.warning("Scheduler failed to start: %s", exc)

    yield

    # ── Shutdown ───────────────────────────────────────────────────────
    if scheduler:
        stop_scheduler()
    if settings.database_url:
        await close_pool()
    await kg.close()
    log.info("AI OS Brain shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="AI OS — Brain",
        description="LangGraph Orchestrator + Multi-Model AI + Debate System + Knowledge Graph + Coding Brain + Extensions",
        version="0.5.0",
        docs_url="/docs" if settings.env != "production" else None,
        redoc_url=None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router,     prefix="/v1")
    app.include_router(chat_router,       prefix="/v1")
    app.include_router(memory_router,     prefix="/v1")
    app.include_router(autonomous_router, prefix="/v1")
    app.include_router(knowledge_router,  prefix="/v1")
    app.include_router(tools_router,      prefix="/v1")
    app.include_router(analytics_router,  prefix="/v1")
    app.include_router(extensions_router, prefix="/v1")
    app.include_router(budget_router,     prefix="/v1")

    return app


app = create_app()
