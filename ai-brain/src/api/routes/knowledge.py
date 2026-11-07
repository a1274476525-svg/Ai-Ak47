"""
Knowledge Graph API routes — query and populate the Neo4j graph.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..deps import get_knowledge_graph
from ...core.knowledge_graph.graph import KnowledgeGraph

log = logging.getLogger(__name__)
router = APIRouter(tags=["knowledge"])


class ConceptIn(BaseModel):
    name: str
    category: str = "general"
    description: str = ""
    source: str = ""
    tags: list[str] = Field(default_factory=list)


class RelationshipIn(BaseModel):
    from_label: str
    from_name: str
    rel_type: str
    to_label: str
    to_name: str
    properties: dict = Field(default_factory=dict)


class InsightIn(BaseModel):
    insight: str
    source_task_id: str | None = None
    related_skills: list[str] = Field(default_factory=list)
    confidence: float = 0.7


# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/knowledge/stats")
async def get_stats(kg: KnowledgeGraph = Depends(get_knowledge_graph)):
    return await kg.get_stats()


# ── Concepts ─────────────────────────────────────────────────────────────────

@router.post("/knowledge/concepts", status_code=201)
async def upsert_concept(
    body: ConceptIn,
    kg: KnowledgeGraph = Depends(get_knowledge_graph),
):
    if not kg.available:
        raise HTTPException(503, "Knowledge Graph unavailable")
    ok = await kg.upsert_concept(
        name=body.name,
        category=body.category,
        description=body.description,
        source=body.source,
        tags=body.tags,
    )
    return {"ok": ok, "name": body.name}


@router.get("/knowledge/concepts/search")
async def search_concepts(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, le=50),
    kg: KnowledgeGraph = Depends(get_knowledge_graph),
):
    return await kg.search_concepts(keyword=q, limit=limit)


# ── Relationships ─────────────────────────────────────────────────────────────

@router.post("/knowledge/relationships", status_code=201)
async def add_relationship(
    body: RelationshipIn,
    kg: KnowledgeGraph = Depends(get_knowledge_graph),
):
    if not kg.available:
        raise HTTPException(503, "Knowledge Graph unavailable")
    ok = await kg.add_relationship(
        from_label=body.from_label,
        from_name=body.from_name,
        rel_type=body.rel_type,
        to_label=body.to_label,
        to_name=body.to_name,
        properties=body.properties,
    )
    return {"ok": ok}


# ── Insights ─────────────────────────────────────────────────────────────────

@router.post("/knowledge/insights", status_code=201)
async def add_insight(
    body: InsightIn,
    kg: KnowledgeGraph = Depends(get_knowledge_graph),
):
    if not kg.available:
        raise HTTPException(503, "Knowledge Graph unavailable")
    ok = await kg.add_insight(
        insight=body.insight,
        source_task_id=body.source_task_id,
        related_skills=body.related_skills,
        confidence=body.confidence,
    )
    return {"ok": ok}


# ── Exploration ───────────────────────────────────────────────────────────────

@router.get("/knowledge/related/{name}")
async def get_related(
    name: str,
    label: str = Query("Concept"),
    depth: int = Query(2, ge=1, le=3),
    limit: int = Query(20, le=100),
    kg: KnowledgeGraph = Depends(get_knowledge_graph),
):
    return await kg.get_related(name=name, label=label, depth=depth, limit=limit)


@router.get("/knowledge/skills/graph")
async def skill_graph(kg: KnowledgeGraph = Depends(get_knowledge_graph)):
    return await kg.get_skill_graph()
