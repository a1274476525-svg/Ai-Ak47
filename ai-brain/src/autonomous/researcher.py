"""
Daily Research Pipeline — fetches from GitHub Trending, Hacker News, and ArXiv.
Runs every day at 3am. Stores findings in Qdrant + creates learning tasks.

No API keys required:
  - GitHub Trending: scrape github.com/trending
  - Hacker News:     Firebase Realtime API (public)
  - ArXiv:           Atom feed API (public)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import httpx

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "AI-OS-Research-Pipeline/0.1 (educational project)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


@dataclass
class TrendingRepo:
    name: str
    description: str
    language: str
    stars_today: str
    url: str


@dataclass
class HNStory:
    title: str
    url: str
    score: int
    comments: int


@dataclass
class ArxivPaper:
    title: str
    authors: list[str]
    summary: str
    url: str
    published: str


@dataclass
class PipelineReport:
    repos: list[TrendingRepo] = field(default_factory=list)
    hn_stories: list[HNStory] = field(default_factory=list)
    papers: list[ArxivPaper] = field(default_factory=list)
    synthesis: str = ""
    knowledge_stored: int = 0
    tasks_created: int = 0
    errors: list[str] = field(default_factory=list)


# ─────────────────────────────────────────
# Fetchers
# ─────────────────────────────────────────

async def fetch_github_trending(language: str = "") -> list[TrendingRepo]:
    url = f"https://github.com/trending{f'/{language}' if language else ''}?since=daily"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=HEADERS)
            resp.raise_for_status()

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, "html.parser")
        repos: list[TrendingRepo] = []

        for article in soup.select("article.Box-row")[:10]:
            name_el = article.select_one("h2 a")
            desc_el = article.select_one("p")
            lang_el = article.select_one("[itemprop='programmingLanguage']")
            stars_el = article.select_one(".f6 span.d-inline-block.float-sm-right")

            if not name_el:
                continue

            name = name_el.get_text(strip=True).replace("\n", "").replace(" ", "")
            repos.append(TrendingRepo(
                name=name,
                description=(desc_el.get_text(strip=True) if desc_el else ""),
                language=(lang_el.get_text(strip=True) if lang_el else ""),
                stars_today=(stars_el.get_text(strip=True) if stars_el else ""),
                url=f"https://github.com{name_el.get('href', '')}",
            ))

        log.info("GitHub Trending: %d repos", len(repos))
        return repos
    except Exception as exc:
        log.warning("GitHub Trending fetch failed: %s", exc)
        return []


async def fetch_hacker_news(limit: int = 10) -> list[HNStory]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
            resp.raise_for_status()
            story_ids = resp.json()[:limit * 2]

        stories: list[HNStory] = []
        async with httpx.AsyncClient(timeout=10) as client:
            for sid in story_ids[:limit]:
                try:
                    r = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
                    item = r.json()
                    if item and item.get("type") == "story" and item.get("url"):
                        stories.append(HNStory(
                            title=item.get("title", ""),
                            url=item.get("url", ""),
                            score=item.get("score", 0),
                            comments=item.get("descendants", 0),
                        ))
                except Exception:
                    continue

        log.info("Hacker News: %d stories", len(stories))
        return stories
    except Exception as exc:
        log.warning("HN fetch failed: %s", exc)
        return []


async def fetch_arxiv_ai(limit: int = 8) -> list[ArxivPaper]:
    url = (
        "https://export.arxiv.org/api/query"
        "?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL"
        "&sortBy=submittedDate&sortOrder=descending"
        f"&max_results={limit}"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=HEADERS)
            resp.raise_for_status()

        import feedparser
        feed = feedparser.parse(resp.text)
        papers: list[ArxivPaper] = []

        for entry in feed.entries[:limit]:
            papers.append(ArxivPaper(
                title=entry.get("title", "").replace("\n", " ").strip(),
                authors=[a.name for a in entry.get("authors", [])[:3]],
                summary=entry.get("summary", "")[:600].replace("\n", " ").strip(),
                url=entry.get("link", ""),
                published=entry.get("published", "")[:10],
            ))

        log.info("ArXiv: %d papers", len(papers))
        return papers
    except Exception as exc:
        log.warning("ArXiv fetch failed: %s", exc)
        return []


# ─────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────

class ResearchPipeline:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        from langchain_anthropic import ChatAnthropic
        self._llm = ChatAnthropic(model=model, api_key=api_key, max_tokens=4096, temperature=0.4)

    async def _synthesize(
        self,
        repos: list[TrendingRepo],
        stories: list[HNStory],
        papers: list[ArxivPaper],
    ) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage

        context_parts: list[str] = []

        if repos:
            context_parts.append(
                "## GitHub Trending Today\n" +
                "\n".join(f"- {r.name} ({r.language}): {r.description}" for r in repos[:8])
            )
        if stories:
            context_parts.append(
                "## Hacker News Top Stories\n" +
                "\n".join(f"- {s.title} [{s.score} pts]" for s in stories[:8])
            )
        if papers:
            context_parts.append(
                "## Latest AI/ML Papers\n" +
                "\n".join(f"- {p.title} ({p.published}): {p.summary[:200]}" for p in papers[:6])
            )

        if not context_parts:
            return "No data retrieved today."

        prompt = (
            "You are the AI OS Research Agent. Analyze today's tech landscape:\n\n"
            + "\n\n".join(context_parts)
            + "\n\n"
            "Write a technical intelligence report covering:\n"
            "1. **Emerging Trends** — what patterns appear across all sources?\n"
            "2. **Key Technologies** — which languages, frameworks, tools are rising?\n"
            "3. **AI/ML Developments** — notable papers and their implications\n"
            "4. **Actionable Insights** — what should the AI OS learn or implement?\n\n"
            "Be specific and technical. 400-600 words."
        )

        response = await self._llm.ainvoke([
            SystemMessage(content="You are a senior AI researcher writing a daily intelligence briefing."),
            HumanMessage(content=prompt),
        ])
        return str(response.content)

    async def _identify_new_skills(self, synthesis: str) -> list[str]:
        """Extract skills/technologies mentioned that might be missing from our skill tree."""
        from langchain_core.messages import HumanMessage
        prompt = (
            f"From this research report, list technologies/frameworks/concepts that seem important:\n\n{synthesis}\n\n"
            "Output a JSON array of strings (technology names only). Example: [\"Rust\", \"LangGraph\", \"LoRA\"]\n"
            "Limit to 5 items max. Output only the JSON array."
        )
        response = await self._llm.ainvoke([HumanMessage(content=prompt)])
        import json
        raw = str(response.content).strip()
        try:
            return json.loads(raw)[:5]
        except Exception:
            return []

    async def run(self, memory_store=None) -> PipelineReport:
        log.info("ResearchPipeline: starting daily run")
        report = PipelineReport()

        # Fetch in parallel
        import asyncio
        results = await asyncio.gather(
            fetch_github_trending(),
            fetch_hacker_news(10),
            fetch_arxiv_ai(8),
            return_exceptions=True,
        )

        for i, res in enumerate(results):
            if isinstance(res, Exception):
                source = ["GitHub", "HN", "ArXiv"][i]
                report.errors.append(f"{source}: {res}")
            elif i == 0:
                report.repos = res         # type: ignore[assignment]
            elif i == 1:
                report.hn_stories = res    # type: ignore[assignment]
            elif i == 2:
                report.papers = res        # type: ignore[assignment]

        # Synthesize
        report.synthesis = await self._synthesize(report.repos, report.hn_stories, report.papers)

        # Store in memory
        if memory_store and report.synthesis:
            from datetime import date
            try:
                await memory_store.store(
                    content=report.synthesis,
                    topic=f"daily_research:{date.today().isoformat()}",
                    source="research_pipeline",
                )
                report.knowledge_stored += 1

                # Also store individual repos with high stars
                for repo in report.repos[:5]:
                    if repo.description:
                        await memory_store.store(
                            content=f"{repo.name}: {repo.description}",
                            topic=f"github_trending:{repo.language or 'misc'}",
                            source="github_trending",
                            url=repo.url,
                        )
                        report.knowledge_stored += 1
            except Exception as exc:
                log.warning("Memory store failed: %s", exc)

        # Create self-assigned learning tasks for new skills
        new_skills = await self._identify_new_skills(report.synthesis)
        for skill_name in new_skills:
            try:
                from ..db.postgres import upsert_skill, create_task
                await upsert_skill(name=skill_name, category="auto_discovered", level=0.0, priority=3)
                await create_task(
                    title=f"Research & learn: {skill_name}",
                    description=f"Discovered in daily research pipeline. Study {skill_name} and assess relevance.",
                    origin="autonomous",
                    assigned_agent="research",
                    priority=3,
                    metadata={"source": "daily_pipeline", "skill": skill_name},
                )
                report.tasks_created += 1
            except Exception as exc:
                log.warning("Failed to create task for %s: %s", skill_name, exc)

        log.info(
            "ResearchPipeline: done | repos=%d hn=%d papers=%d stored=%d tasks=%d errors=%d",
            len(report.repos), len(report.hn_stories), len(report.papers),
            report.knowledge_stored, report.tasks_created, len(report.errors),
        )
        return report
