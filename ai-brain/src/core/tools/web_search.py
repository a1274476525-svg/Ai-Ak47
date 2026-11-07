"""
Web search tool using DuckDuckGo — no API key required.
"""
from __future__ import annotations

import logging
from langchain_core.tools import tool

log = logging.getLogger(__name__)


@tool
def web_search(query: str) -> str:
    """Search the web for current information. Use for research, facts, docs, news."""
    try:
        from duckduckgo_search import DDGS
        results: list[str] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=6):
                results.append(
                    f"Title: {r.get('title', '')}\n"
                    f"URL: {r.get('href', '')}\n"
                    f"Snippet: {r.get('body', '')}"
                )
        if not results:
            return "No results found for that query."
        return "\n\n---\n\n".join(results)
    except Exception as exc:
        log.warning("Web search failed for '%s': %s", query, exc)
        return f"Search failed: {exc}"


@tool
def web_search_news(query: str) -> str:
    """Search for recent news articles on a topic."""
    try:
        from duckduckgo_search import DDGS
        results: list[str] = []
        with DDGS() as ddgs:
            for r in ddgs.news(query, max_results=5):
                results.append(
                    f"Title: {r.get('title', '')}\n"
                    f"Source: {r.get('source', '')}\n"
                    f"Date: {r.get('date', '')}\n"
                    f"URL: {r.get('url', '')}\n"
                    f"Body: {r.get('body', '')}"
                )
        if not results:
            return "No news found."
        return "\n\n---\n\n".join(results)
    except Exception as exc:
        log.warning("News search failed: %s", exc)
        return f"Search failed: {exc}"
