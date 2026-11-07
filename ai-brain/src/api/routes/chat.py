import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...api.deps import get_agent_registry, get_memory_store, get_provider_registry
from ...agents.registry import AgentRegistry
from ...core.memory.qdrant_store import MemoryStore
from ...core.providers.registry import ProviderRegistry
from ...core.router import TaskType, detect_task_type

log = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────

class MessageInput(BaseModel):
    role: str
    content: str


class Attachment(BaseModel):
    type: str                     # "text" | "image"
    name: str
    content: str | None = None    # text attachments
    mime: str | None = None       # image attachments
    base64: str | None = None     # image attachments (unused today — see note below)


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=20_000)
    history: list[MessageInput] = Field(default_factory=list)
    provider: str | None = None           # force specific provider
    task_type: str = "auto"               # "auto" → detect from message
    use_debate: bool = False              # explicitly trigger debate mode
    conversation_id: str | None = None
    attachment: Attachment | None = None


class ChatResponse(BaseModel):
    content: str
    provider: str
    model: str
    tokensIn: int
    tokensOut: int
    durationMs: int
    taskType: str
    agentUsed: str
    debateUsed: bool


# ─────────────────────────────────────────
# Route
# ─────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    agents: AgentRegistry = Depends(get_agent_registry),
    memory: MemoryStore   = Depends(get_memory_store),
) -> ChatResponse:
    import time

    # Attach memory to agent registry (idempotent)
    agents.set_memory(memory)

    # Detect task type
    task_type: TaskType = (
        detect_task_type(req.message)
        if req.task_type == "auto"
        else req.task_type  # type: ignore[assignment]
    )

    log.info(
        "chat | task=%s provider=%s debate=%s",
        task_type, req.provider or "auto", req.use_debate,
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    if req.attachment:
        if req.attachment.type == "image":
            # Providers here take plain-text messages only — no multimodal content
            # blocks are wired up yet. Rather than silently drop the image (which
            # would let the model hallucinate a description it never saw), say so.
            return ChatResponse(
                content=(
                    "Image attachments aren't supported yet — this build only reads "
                    "text/code files into context. Please describe the image in words, "
                    "or attach the relevant text/code instead."
                ),
                provider="system", model="", tokensIn=0, tokensOut=0, durationMs=0,
                taskType=task_type, agentUsed="system", debateUsed=False,
            )
        elif req.attachment.type == "text" and req.attachment.content:
            messages[-1]["content"] += (
                f"\n\n=== Attached file: {req.attachment.name} ===\n{req.attachment.content}"
            )

    start = time.monotonic()
    try:
        result = await agents.run(
            messages=messages,
            task_type=task_type,
            preferred_provider=req.provider,
            use_debate=req.use_debate,
        )
    except RuntimeError as exc:
        log.error("No provider: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Chat error")
        raise HTTPException(status_code=500, detail="AI processing error") from exc

    duration_ms = int((time.monotonic() - start) * 1000)

    return ChatResponse(
        content     = result["content"],
        provider    = result.get("provider", "unknown"),
        model       = result.get("model", ""),
        tokensIn    = result.get("tokens_in", 0),
        tokensOut   = result.get("tokens_out", 0),
        durationMs  = duration_ms,
        taskType    = task_type,
        agentUsed   = result.get("agent_used", "direct"),
        debateUsed  = result.get("debate_used", False),
    )


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    providers: ProviderRegistry = Depends(get_provider_registry),
) -> StreamingResponse:
    """
    Token-by-token streaming chat over Server-Sent Events.

    Scope: always talks directly to a single provider (no debate mode, no
    specialised coding/testing/security/content/coding_brain agents — those
    require multi-step orchestration that isn't compatible with token
    streaming). Use POST /chat for those. Emits `data: {...}\\n\\n` lines;
    the final line carries `"done": true` plus usage/timing.
    """
    from ...core.budget import check_budget, BudgetExceeded

    task_type: TaskType = (
        detect_task_type(req.message)
        if req.task_type == "auto"
        else req.task_type  # type: ignore[assignment]
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    async def event_stream():
        try:
            await check_budget()
        except BudgetExceeded as exc:
            yield f"data: {json.dumps({'error': exc.detail})}\n\n"
            return

        try:
            async for chunk in providers.stream_chat(
                messages=messages, task_type=task_type, preferred_provider=req.provider,
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        except Exception:
            log.exception("chat_stream error")
            yield f"data: {json.dumps({'error': 'AI processing error'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
