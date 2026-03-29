import requests
import urllib.parse
import os
from dotenv import load_dotenv

load_dotenv()

def get_wikipedia_image(query: str, depth=0) -> str:
    """
    Highly robust Wikipedia image crawler.
    Prioritizes technical diagrams and scientific visuals for research topics.
    Falls back to Pexels if Wikipedia fails.
    
    Includes recursive attempt with simplified queries if the initial search is too specific.
    """
    if not query or depth > 1:
        return None
        
    headers = {
        "User-Agent": "EdunovasAI/1.0 (https://edunovas.ai; support@edunovas.ai) requests/2.0"
    }
    
    try:
        # ─── 1. Identify Target Page ──────────────────────────────────────────
        search_url = "https://en.wikipedia.org/w/api.php"
        search_params = {
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": 1
        }
        search_resp = requests.get(search_url, params=search_params, headers=headers, timeout=5)
        search_resp.raise_for_status()
        search_data = search_resp.json()
        
        search_results = search_data.get("query", {}).get("search", [])
        if not search_results:
            # Try simplified query before falling back to Pexels
            words = query.split()
            if len(words) > 1:
                simpler = " ".join(words[:-1])
                return get_wikipedia_image(simpler, depth + 1)
            
            # Fallback to Pexels if no Wikipedia page found at all
            try:
                from services.pexels_service import get_pexels_image
                return get_pexels_image(query)
            except ImportError:
                return None
            
        page_title = search_results[0]["title"]
        safe_title = urllib.parse.quote(page_title)
        
        # ─── 2. Try REST API Summary (Fastest, Lead Image) ────────────────────
        summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{safe_title}"
        summary_resp = requests.get(summary_url, headers=headers, timeout=5)
        if summary_resp.status_code == 200:
            sum_data = summary_resp.json()
            if "originalimage" in sum_data:
                return sum_data["originalimage"].get("source")
            if "thumbnail" in sum_data:
                return sum_data["thumbnail"].get("source")
        
        # ─── 3. Try PageImages Prop (Official Main Image) ─────────────────────
        query_url = "https://en.wikipedia.org/w/api.php"
        pimg_params = {
            "action": "query",
            "prop": "pageimages",
            "titles": page_title,
            "pithumbsize": 1000,
            "format": "json"
        }
        pimg_resp = requests.get(query_url, params=pimg_params, headers=headers, timeout=5)
        if pimg_resp.status_code == 200:
            pimg_data = pimg_resp.json()
            pages = pimg_data.get("query", {}).get("pages", {})
            for pid in pages:
                if "thumbnail" in pages[pid]:
                    return pages[pid]["thumbnail"].get("source")

        # ─── 4. Inspect All Images on Page (Highest Accuracy for Diagrams) ────
        # Useful for things like "LLM" or "TensorFlow" where the lead image is missing
        imglist_params = {
            "action": "query",
            "prop": "images",
            "titles": page_title,
            "format": "json"
        }
        imglist_resp = requests.get(query_url, params=imglist_params, headers=headers, timeout=5)
        if imglist_resp.status_code == 200:
            imglist_data = imglist_resp.json()
            pages = imglist_data.get("query", {}).get("pages", {})
            for pid in pages:
                images = pages[pid].get("images", [])
                # Filter for technical looking files (diagrams, PNGs, etc)
                # Skip icons and status badges
                for img in images:
                    title = img.get("title", "").lower()
                    if any(x in title for x in ["diagram", "architecture", "flow", "structure", "model"]):
                        url = _get_file_url(img["title"], headers)
                        if url: return url
                
                # If no "keywords" match, try the first few non-SVG (likely photos/diagrams)
                for img in images[:5]:
                    title = img.get("title", "").lower()
                    if title.endswith((".png", ".jpg", ".jpeg")):
                        url = _get_file_url(img["title"], headers)
                        if url: return url

        # ─── 5. Global Media Search (Last Resort Wikipedia) ───────────────────
        media_search_params = {
            "action": "query",
            "list": "search",
            "srsearch": f"{query} research diagram",
            "srnamespace": 6,
            "format": "json",
            "srlimit": 1
        }
        msearch_resp = requests.get(query_url, params=media_search_params, headers=headers, timeout=5)
        msearch_data = msearch_resp.json()
        results = msearch_data.get("query", {}).get("search", [])
        if results:
            url = _get_file_url(results[0]["title"], headers)
            if url: return url

        # ─── 6. Final Attempt: Simplified Query or Pexels ─────────────────────
        if depth == 0:
            words = query.split()
            if len(words) > 1:
                return get_wikipedia_image(" ".join(words[:-1]), depth + 1)

        try:
            from services.pexels_service import get_pexels_image
            return get_pexels_image(query)
        except:
            return None
            
    except Exception as e:
        print(f"Wikipedia Service Critical Error: {e}")
        try:
            from services.pexels_service import get_pexels_image
            return get_pexels_image(query)
        except:
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
    except:
        pass
    return None
