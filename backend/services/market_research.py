import os
import requests
import json
try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None

def get_market_trends(query: str, max_results: int = 5):
    """Fetches real-time market data, prioritizing Serper for LinkedIn/Glassdoor insights."""
    serper_key = os.getenv("SERPER_API_KEY")
    
    if serper_key:
        try:
            url = "https://google.serper.dev/search"
            payload = json.dumps({"q": query, "num": max_results})
            headers = {
                'X-API-KEY': serper_key,
                'Content-Type': 'application/json'
            }
            response = requests.post(url, headers=headers, data=payload, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            snippets = []
            for item in data.get("organic", []):
                snippet = f"[{item.get('title', 'Unknown')}] {item.get('snippet', '')}"
                snippets.append(snippet)
            
            if snippets:
                print(f"✅ Serper: Found {len(snippets)} market signals.")
                return snippets
        except Exception as e:
            print(f"Serper Market Research Error: {e}")

    # Fallback to DDGS
    if DDGS:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                return [f"[{r.get('title')}] {r.get('body')}" for r in results]
        except Exception as e:
            print(f"DuckDuckGo Market Research Error: {e}")

    return []
