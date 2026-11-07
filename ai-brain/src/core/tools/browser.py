"""
Browser Automation — Playwright headless Chromium.

Tools:
  browse_url     — navigate to URL, return title + text (up to 3000 chars)
  screenshot_url — capture screenshot as base64 PNG
  extract_links  — return all hyperlinks from a page

All tools run in a thread to avoid blocking FastAPI's event loop.
Playwright must be installed with: playwright install --with-deps chromium
"""
from __future__ import annotations

import asyncio
import base64
import logging
from langchain_core.tools import tool

log = logging.getLogger(__name__)

TIMEOUT_MS = 30_000
MAX_TEXT   = 3_000
MAX_LINKS  = 50

_LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
]


def _is_valid_url(url: str) -> bool:
    return url.startswith(("http://", "https://"))


# ── Sync helpers (run in thread) ───────────────────────────────────────────────

def _sync_browse(url: str) -> dict:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=_LAUNCH_ARGS)
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
            title = page.title()
            text  = page.inner_text("body")[:MAX_TEXT]
            browser.close()
            return {"title": title, "text": text}
    except Exception as exc:
        log.warning("browse_url error: %s", exc)
        return {"error": str(exc)}


def _sync_screenshot(url: str) -> dict:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=_LAUNCH_ARGS)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
            data = page.screenshot(full_page=False)
            browser.close()
            return {"base64": base64.b64encode(data).decode()}
    except Exception as exc:
        log.warning("screenshot_url error: %s", exc)
        return {"error": str(exc)}


def _sync_extract_links(url: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=_LAUNCH_ARGS)
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)
            links = page.eval_on_selector_all(
                "a[href]",
                "els => els.map(e => ({text: e.innerText.trim().slice(0,80), href: e.href}))",
            )
            browser.close()
            return links[:MAX_LINKS]
    except Exception as exc:
        log.warning("extract_links error: %s", exc)
        return [{"error": str(exc)}]


# ── LangChain tools ────────────────────────────────────────────────────────────

@tool
def browse_url(url: str) -> str:
    """
    Navigate to a URL with a headless browser and return the page title and text
    content (up to 3000 characters). Use for reading documentation, articles, etc.
    """
    if not _is_valid_url(url):
        return "Error: URL must start with http:// or https://"
    result = asyncio.get_event_loop().run_in_executor(None, _sync_browse, url)
    # run synchronously since @tool may be called in a sync context
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_sync_browse, url)
        res = future.result(timeout=35)
    if "error" in res:
        return f"Error browsing {url}: {res['error']}"
    return f"Title: {res['title']}\n\nContent:\n{res['text']}"


@tool
def screenshot_url(url: str) -> str:
    """
    Take a screenshot of a web page using a headless browser.
    Returns base64-encoded PNG prefixed with 'screenshot:base64:'.
    """
    if not _is_valid_url(url):
        return "Error: URL must start with http:// or https://"
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        res = ex.submit(_sync_screenshot, url).result(timeout=35)
    if "error" in res:
        return f"Error: {res['error']}"
    return f"screenshot:base64:{res['base64']}"


@tool
def extract_links(url: str) -> str:
    """
    Extract all hyperlinks from a web page. Returns up to 50 links with text and href.
    Use for discovering navigation structure or gathering reference URLs.
    """
    if not _is_valid_url(url):
        return "Error: URL must start with http:// or https://"
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        links = ex.submit(_sync_extract_links, url).result(timeout=35)
    if links and "error" in links[0]:
        return f"Error: {links[0]['error']}"
    lines = [f"{i+1}. [{l.get('text','').strip()}]({l.get('href','')})" for i, l in enumerate(links)]
    return "\n".join(lines) or "No links found."


# ── Async wrappers for use inside FastAPI routes ───────────────────────────────

async def async_browse(url: str) -> dict:
    return await asyncio.to_thread(_sync_browse, url)


async def async_screenshot(url: str) -> dict:
    return await asyncio.to_thread(_sync_screenshot, url)


async def async_extract_links(url: str) -> list[dict]:
    return await asyncio.to_thread(_sync_extract_links, url)
