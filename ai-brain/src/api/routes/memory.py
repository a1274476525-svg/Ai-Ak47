import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ...api.deps import get_memory_store
from ...core.memory.qdrant_store import MemoryStore, SearchResult

log = logging.getLogger(__name__)
router = APIRouter()


class StoreRequest(BaseModel):
    content: str
    topic: str
    source: str = "manual"


class SearchResponse(BaseModel):
    results: list[dict]
    total: int


@router.get("/memory/search", response_model=SearchResponse)
async def search_memory(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(default=5, le=20),
    memory: MemoryStore = Depends(get_memory_store),
) -> SearchResponse:
    try:
        results: list[SearchResult] = await memory.search(q, limit=limit)
    except Exception as exc:
        log.error("memory/search: %s", exc)
        raise HTTPException(status_code=503, detail="Vector memory unavailable")
    return SearchResponse(
        results=[
            {
                "id":      r.id,
                "score":   round(r.score, 4),
                "content": r.content,
                "topic":   r.topic,
                "source":  r.source,
                **r.metadata,
            }
            for r in results
        ],
        total=len(results),
    )


@router.post("/memory", status_code=201)
async def store_knowledge(
    body: StoreRequest,
    memory: MemoryStore = Depends(get_memory_store),
) -> dict:
    try:
        point_id = await memory.store(
            content=body.content,
            topic=body.topic,
            source=body.source,
        )
    except Exception as exc:
        log.error("memory/store: %s", exc)
        raise HTTPException(status_code=503, detail="Vector memory unavailable")
    return {"id": point_id, "stored": True}
