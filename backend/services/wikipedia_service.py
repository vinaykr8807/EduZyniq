import requests
import urllib.parse
import os
from dotenv import load_dotenv
from typing import Optional, List

load_dotenv()

def get_wikipedia_image(query: str, depth=0) -> Optional[str]:
    """
    Highly robust and aggressive Wikipedia image crawler.
    Prioritizes technical diagrams, architectures, and schematics.
    Falls back to Pexels if Wikipedia fails.
    """
    if not query or depth > 2:
        return None
        
    headers = {
        "User-Agent": "EduZyniqAI/1.0 (https://eduzyniq.ai; support@eduzyniq.ai) requests/2.0"
    }

    # Internal helper to find highest quality visual from a title
    def _extract_from_title(title: str) -> Optional[str]:
        # 1. Try REST API Lead Image
        safe_title = urllib.parse.quote(title)
        sum_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{safe_title}"
        try:
            r = requests.get(sum_url, headers=headers, timeout=5)
            if r.status_code == 200:
                data = r.json()
                if "originalimage" in data: return data["originalimage"].get("source")
                if "thumbnail" in data: return data["thumbnail"].get("source")
        except: pass
        return None

    try:
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
                            if any(x in img_t for x in ["diagram", "architecture", "flow", "structure", "model", "schematic", "internal", "layout"]):
                                url = _get_file_url(img["title"], headers)
                                if url: return url
            
            # If no diagrams found in top 3 pages for this query, try lead image of first result
            if results:
                lead_img = _extract_from_title(results[0]["title"])
                if lead_img: return lead_img

        # Last Resort: Recursive simplify or Pexels
        if depth == 0:
            words = query.split()
            if len(words) > 1:
                return get_wikipedia_image(" ".join(words[:-1]), depth + 1)

        from services.pexels_service import get_pexels_image
        return get_pexels_image(query)
            
    except Exception as e:
        print(f"Aggressive Wikipedia Service Error: {e}")
        try:
            from services.pexels_service import get_pexels_image
            return get_pexels_image(query)
        except: return None

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
