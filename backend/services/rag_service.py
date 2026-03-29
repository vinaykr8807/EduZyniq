import os
import faiss
import numpy as np
import trafilatura
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
from sentence_transformers import SentenceTransformer
from playwright.sync_api import sync_playwright

# Initialize models
try:
    embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
except Exception as e:
    print(f"Failed to load sentence transformer: {e}")
    embedding_model = None

def get_search_results(query: str, max_results: int = 5) -> list[str]:
    print(f"Searching DuckDuckGo for: {query}")
    urls = []
    try:
        results = DDGS().text(query, max_results=max_results)
        for r in results:
            if 'href' in r:
                urls.append(r['href'])
    except Exception as e:
        print(f"DDGS error: {e}")
    return urls

def scrape_pages(urls: list[str]) -> str:
    combined_text = ""
    # Try trafilatura direct fetch first (no browser needed)
    for url in urls:
        try:
            downloaded = trafilatura.fetch_url(url)
            if downloaded:
                text = trafilatura.extract(downloaded)
                if text:
                    print(f"Scraping: {url}")
                    combined_text += f"\n\nSource: {url}\n{text[:2000]}"
        except Exception as e:
            print(f"Error scraping {url}: {e}")
    
    if combined_text:
        return combined_text

    # Fallback to Playwright if trafilatura got nothing
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent="Mozilla/5.0")
            page = context.new_page()
            page.set_default_timeout(8000)
            for url in urls:
                try:
                    page.goto(url)
                    html = page.content()
                    text = trafilatura.extract(html)
                    if text:
                        print(f"Scraping: {url} (via Playwright)")
                        combined_text += f"\n\nSource: {url}\n{text[:2000]}"
                except Exception as e:
                    print(f"Error scraping {url}: {e}")
            browser.close()
    except Exception as e:
        print(f"Playwright error (non-fatal): {e}")

    return combined_text

def chunk_text(text: str, chunk_size: int = 500) -> list[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i + chunk_size]))
    return chunks

def retrieve_context(query: str, combined_text: str, top_k: int = 4) -> str:
    if not combined_text.strip() or embedding_model is None:
        return ""
    
    chunks = chunk_text(combined_text)
    if not chunks:
        return ""

    try:
        # Embed chunks
        chunk_embeddings = embedding_model.encode(chunks)
        
        # Build FAISS index
        dimension = chunk_embeddings.shape[1]
        index = faiss.IndexFlatL2(dimension)
        index.add(np.array(chunk_embeddings).astype('float32'))
        
        # Embed query and search
        query_embedding = embedding_model.encode([query])
        distances, indices = index.search(np.array(query_embedding).astype('float32'), top_k)
        
        # Retrieve texts
        relevant_chunks = []
        for idx in indices[0]:
            if idx != -1 and idx < len(chunks):
                relevant_chunks.append(chunks[idx])
        
        return "\n\n... ".join(relevant_chunks)
    except Exception as e:
        print(f"RAG Retrieval Error: {e}")
        return ""

def generate_rag_context(topic: str, subtopic: str, domain: str) -> str:
    import concurrent.futures
    query = f"{subtopic} in {topic} for {domain} architecture detailed explanation"
    try:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(_fetch_rag_context, query)
            return future.result(timeout=15)  # Hard 15s cap so it never blocks Groq
    except Exception as e:
        print(f"RAG context timed out or failed: {e}")
        return ""

def _fetch_rag_context(query: str) -> str:
    print("\n  [1/7] Web search…")
    urls = get_search_results(query, max_results=5)
    if not urls:
        return ""
    
    print("  [2/7] Scraping pages…")
    scraped_text = scrape_pages(urls)
    
    print("  [3/7] RAG vector retrieval…")
    return retrieve_context(query, scraped_text, top_k=5)
