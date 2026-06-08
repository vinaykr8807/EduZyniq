import requests
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

def get_wikipedia_image(query: str, depth=0) -> Optional[str]:
    """
    Fetch a topic-relevant Wikipedia/Wikimedia image.
    Prioritizes technical diagrams, architectures, and schematics and
    returns None when a confident technical match cannot be found.
    """
    if not query or depth > 2:
        return None
        
    headers = {
        "User-Agent": "EduZyniqAI/1.0 (https://eduzyniq.ai; support@eduzyniq.ai) requests/2.0"
    }

    try:
        technical_keywords = [
            "diagram", "architecture", "flow", "structure", "model",
            "schematic", "internal", "layout", "topology", "pipeline",
            "workflow", "uml", "graph", "chart", "network"
        ]

        # Aggressive Search Prep: Try raw query AND diagram/architecture versions
        queries_to_try = [f"{query} diagram", f"{query} architecture", query]
        
        for q in queries_to_try:
            search_params = {
                "action": "query",
                "list": "search",
                "srsearch": q,
                "format": "json",
                "srlimit": 3 
            }
            search_resp = requests.get("https://en.wikipedia.org/w/api.php", params=search_params, headers=headers, timeout=5)
            search_data = search_resp.json()
            results = search_data.get("query", {}).get("search", [])
            
            for res in results:
                page_title = res["title"]
                
                # Check for technical images specifically on this page
                imglist_params = {
                    "action": "query",
                    "prop": "images",
                    "titles": page_title,
                    "format": "json"
                }
                imglist_resp = requests.get("https://en.wikipedia.org/w/api.php", params=imglist_params, headers=headers, timeout=5)
                if imglist_resp.status_code == 200:
                    pages = imglist_resp.json().get("query", {}).get("pages", {})
                    for pid in pages:
                        images = pages[pid].get("images", [])
                        # Priority: Match technical keywords in file titles
                        for img in images:
                            img_t = img.get("title", "").lower()
                            if any(keyword in img_t for keyword in technical_keywords):
                                url = _get_file_url(img["title"], headers)
                                if url: return url

        # Last resort: simplify the query once or twice, but keep the source strict.
        if depth == 0:
            words = query.split()
            if len(words) > 1:
                return get_wikipedia_image(" ".join(words[:-1]), depth + 1)
        elif depth == 1:
            words = query.split()
            if len(words) > 2:
                return get_wikipedia_image(" ".join(words[:-2]), depth + 1)

        return None
            
    except Exception as e:
        print(f"Aggressive Wikipedia Service Error: {e}")
        return None

def _get_file_url(file_title, headers):
    """Helper to get the direct URL for a File: page."""
    try:
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "prop": "imageinfo",
            "titles": file_title,
            "iiprop": "url",
            "iiurlwidth": 1000,
            "format": "json"
        }
        r = requests.get(url, params=params, headers=headers, timeout=5)
        data = r.json()
        pages = data.get("query", {}).get("pages", {})
        for pid in pages:
            if "imageinfo" in pages[pid]:
                return pages[pid]["imageinfo"][0].get("thumburl") or pages[pid]["imageinfo"][0].get("url")
    except: pass
    return None
