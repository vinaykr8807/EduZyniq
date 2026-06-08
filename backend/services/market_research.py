import os
import requests
import json
from typing import Iterable

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None


def _serper_search(query: str, max_results: int, serper_key: str) -> list[str]:
    url = "https://google.serper.dev/search"
    payload = json.dumps({"q": query, "num": max_results})
    headers = {
        "X-API-KEY": serper_key,
        "Content-Type": "application/json",
    }
    response = requests.post(url, headers=headers, data=payload, timeout=8)
    response.raise_for_status()
    data = response.json()

    snippets = []
    for item in data.get("organic", []):
        title = item.get("title", "Unknown")
        link = item.get("link", "")
        snippet = item.get("snippet", "")
        source = link.split("/")[2].replace("www.", "") if "://" in link else "web"
        snippets.append(f"[{source} | {title}] {snippet}")
    return snippets


def _dedupe_signals(signals: Iterable[str], limit: int) -> list[str]:
    seen = set()
    cleaned = []
    for signal in signals:
        key = " ".join(signal.lower().split())[:220]
        if not key or key in seen:
            continue
        seen.add(key)
        cleaned.append(signal)
        if len(cleaned) >= limit:
            break
    return cleaned


def get_market_trends(query: str, max_results: int = 5):
    """Fetch role signals from job descriptions, review sites, and startup hiring sources."""
    serper_key = os.getenv("SERPER_API_KEY")

    if serper_key:
        try:
            targeted_queries = [
                query,
                f"{query} site:glassdoor.co.in reviews interview questions skills",
                f"{query} site:ambitionbox.com reviews interview questions skills",
                f"{query} site:indeed.com job description requirements",
                f"{query} site:wellfound.com startup jobs requirements",
                f"{query} site:cutshort.io startup jobs skills",
                f"{query} site:hirist.tech requirements",
                f"{query} site:instahyre.com startup hiring skills",
                f"{query} site:linkedin.com/jobs requirements responsibilities",
                f"{query} startup hiring India YC Sequoia Accel SaaS fintech skills",
            ]

            snippets = []
            per_query = max(2, min(max_results, 4))
            for targeted_query in targeted_queries:
                snippets.extend(_serper_search(targeted_query, per_query, serper_key))

            snippets = _dedupe_signals(snippets, limit=max(18, max_results * 4))

            if snippets:
                print(f"Serper: Found {len(snippets)} role, review, and startup market signals.")
                return snippets
        except Exception as e:
            print(f"Serper Market Research Error: {e}")

    if DDGS:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                return [f"[{r.get('title')}] {r.get('body')}" for r in results]
        except Exception as e:
            print(f"DuckDuckGo Market Research Error: {e}")

    return []
