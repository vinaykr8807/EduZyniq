import requests
import re

def get_wikipedia_image(query: str) -> str:
    """
    Fetch a relevant image from Wikipedia for a given query.
    Returns the URL of the image or None if not found.
    """
    if not query:
        return None
    
    # 1. Search for the most relevant page title
    search_url = "https://en.wikipedia.org/w/api.php"
    search_params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": 1
    }
    
    try:
        r = requests.get(search_url, params=search_params, timeout=5)
        if not r.ok:
            return None
            
        try:
            search_data = r.json()
        except ValueError:
            return None
            
        search_results = search_data.get("query", {}).get("search", [])
        
        if not search_results:
            return None
        
        page_title = search_results[0]["title"]
        
        # 2. Get the main image from the page
        image_params = {
            "action": "query",
            "format": "json",
            "titles": page_title,
            "prop": "pageimages|images",
            "piprop": "original",
            "pilicense": "any"
        }
        
        ri = requests.get(search_url, params=image_params, timeout=5)
        if not ri.ok:
            return None
            
        try:
            image_data = ri.json()
        except ValueError:
            return None
            
        pages = image_data.get("query", {}).get("pages", {})
        
        for pid in pages:
            page = pages[pid]
            if "original" in page:
                return page["original"]["source"]
                
    except Exception as e:
        print(f"Wikipedia Image Search Error: {e}")
        
    return None
