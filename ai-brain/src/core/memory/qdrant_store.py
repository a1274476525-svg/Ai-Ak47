"""
Vector Memory — Qdrant store with local fastembed embeddings.
No OpenAI calls for embeddings — runs fully locally.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

log = logging.getLogger(__name__)

COLLECTION_KNOWLEDGE = "knowledge"
COLLECTION_CODE      = "code_patterns"
VECTOR_SIZE          = 384          # all-MiniLM-L6-v2 via fastembed


@dataclass
class SearchResult:
    id: str
    score: float
    content: str
    topic: str
    source: str
    metadata: dict = field(default_factory=dict)


class MemoryStore:
    """
    Semantic memory backed by Qdrant.
    Uses fastembed (bundled with qdrant-client) — no extra API key needed.
    """

    def __init__(self, url: str) -> None:
        self._url = url
        self._client: AsyncQdrantClient | None = None
        self._embedder = None

    # ── Init ──────────────────────────────────────────────────────────────

    async def init(self) -> None:
        self._client = AsyncQdrantClient(url=self._url)

        # Local embedding model (downloads ~23MB on first run)
        from fastembed import TextEmbedding
        self._embedder = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
        log.info("MemoryStore: embedding model loaded")

        for name in (COLLECTION_KNOWLEDGE, COLLECTION_CODE):
            await self._ensure_collection(name)

        log.info("MemoryStore: Qdrant ready at %s", self._url)

    async def _ensure_collection(self, name: str) -> None:
        client = self._get_client()
        existing = {c.name for c in (await client.get_collections()).collections}
        if name not in existing:
            await client.create_collection(
                collection_name=name,
                vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
            )
            log.info("MemoryStore: created collection '%s'", name)

    def _get_client(self) -> AsyncQdrantClient:
        if self._client is None:
            raise RuntimeError("MemoryStore not initialized — call await store.init() first")
        return self._client

    # ── Embedding ─────────────────────────────────────────────────────────

    def _embed(self, text: str) -> list[float]:
        if self._embedder is None:
            raise RuntimeError("Embedder not ready")
        return list(next(self._embedder.embed([text])))

    # ── Write ─────────────────────────────────────────────────────────────

    async def store(
        self,
        content: str,
        topic: str,
        source: str = "agent",
        collection: str = COLLECTION_KNOWLEDGE,
        **extra_meta: object,
    ) -> str:
        """Embed and store a knowledge item. Returns the point ID."""
        point_id = str(uuid.uuid4())
        vector = self._embed(content)

        await self._get_client().upsert(
            collection_name=collection,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "content": content,
                        "topic": topic,
                        "source": source,
                        **extra_meta,
                    },
                )
            ],
        )
        log.debug("MemoryStore: stored point %s (topic=%s)", point_id, topic)
        return point_id

    async def store_code(
        self,
        code: str,
        language: str,
        name: str,
        description: str = "",
        **extra_meta: object,
    ) -> str:
        """Store a reusable code pattern."""
        return await self.store(
            content=f"{name}: {description}\n\n{code}",
            topic=f"code:{language}:{name}",
            source="coding_agent",
            collection=COLLECTION_CODE,
            language=language,
            pattern_name=name,
            code=code,
            description=description,
            **extra_meta,
        )

    # ── Search ────────────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        limit: int = 5,
        collection: str = COLLECTION_KNOWLEDGE,
        topic_filter: str | None = None,
        score_threshold: float = 0.35,
    ) -> list[SearchResult]:
        """Semantic search. Returns top-k results above the score threshold."""
        vector = self._embed(query)

        qfilter = None
        if topic_filter:
            qfilter = Filter(must=[FieldCondition(key="topic", match=MatchValue(value=topic_filter))])

        response = await self._get_client().query_points(
            collection_name=collection,
            query=vector,
            limit=limit,
            query_filter=qfilter,
            score_threshold=score_threshold,
            with_payload=True,
        )
        hits = response.points

        return [
            SearchResult(
                id=str(hit.id),
                score=hit.score,
                content=hit.payload.get("content", "") if hit.payload else "",
                topic=hit.payload.get("topic", "") if hit.payload else "",
                source=hit.payload.get("source", "") if hit.payload else "",
                metadata={k: v for k, v in (hit.payload or {}).items() if k not in ("content", "topic", "source")},
            )
            for hit in hits
        ]

    async def search_code(self, query: str, language: str | None = None, limit: int = 5) -> list[SearchResult]:
        """Search the code patterns collection."""
        results = await self.search(query, limit=limit * 2, collection=COLLECTION_CODE, score_threshold=0.3)
        if language:
            results = [r for r in results if r.metadata.get("language") == language]
        return results[:limit]
