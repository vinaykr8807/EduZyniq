import os
import hashlib
import re
import numpy as np
import trafilatura
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
from playwright.sync_api import sync_playwright

RAG_VECTOR_BACKEND = os.getenv("RAG_VECTOR_BACKEND", "numpy").lower()
RAG_EMBEDDING_BACKEND = os.getenv("RAG_EMBEDDING_BACKEND", "hash").lower()
RAG_CONTEXT_TIMEOUT_SECONDS = float(os.getenv("RAG_CONTEXT_TIMEOUT_SECONDS", "35"))
RAG_EMBEDDING_DIMENSION = int(os.getenv("RAG_EMBEDDING_DIMENSION", "384"))
embedding_model = None


def _get_faiss():
    if RAG_VECTOR_BACKEND != "faiss":
        return None
    try:
        import faiss
        return faiss
    except Exception as e:
        print(f"FAISS backend requested but faiss-cpu is unavailable: {e}")
        return None


def _get_embedding_model():
    if RAG_EMBEDDING_BACKEND == "hash":
        return None

    global embedding_model
    if embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print(f"Failed to load sentence transformer: {e}")
            return None
    return embedding_model


def _hash_embed_texts(texts: list[str]) -> np.ndarray:
    def bucket(value: str) -> int:
        digest = hashlib.sha256(value.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") % RAG_EMBEDDING_DIMENSION

    vectors = np.zeros((len(texts), RAG_EMBEDDING_DIMENSION), dtype="float32")
    for row, text in enumerate(texts):
        tokens = re.findall(r"[A-Za-z0-9_+#.-]+", text.lower())
        for token in tokens:
            vectors[row, bucket(token)] += 1.0
            if len(token) > 4:
                vectors[row, bucket(token[:4])] += 0.35
                vectors[row, bucket(token[-4:])] += 0.35
        norm = np.linalg.norm(vectors[row])
        if norm > 0:
            vectors[row] /= norm
    return vectors


def _embed_texts(texts: list[str]) -> np.ndarray:
    model = _get_embedding_model()
    if model is None:
        return _hash_embed_texts(texts)
    return np.array(model.encode(texts)).astype("float32")

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
    if not combined_text.strip():
        return ""
    
    chunks = chunk_text(combined_text)
    if not chunks:
        return ""

    try:
        chunk_embeddings = _embed_texts(chunks)
        query_embedding = _embed_texts([query])

        faiss = _get_faiss()
        if faiss is not None:
            index = faiss.IndexFlatL2(chunk_embeddings.shape[1])
            index.add(chunk_embeddings)
            _, search_indices = index.search(query_embedding, top_k)
            indices = search_indices[0]
        else:
            distances = np.linalg.norm(chunk_embeddings - query_embedding[0], axis=1)
            indices = np.argsort(distances)[:top_k]
        
        # Retrieve texts
        relevant_chunks = []
        for idx in indices:
            if idx < len(chunks):
                relevant_chunks.append(chunks[int(idx)])
        
        return "\n\n... ".join(relevant_chunks)
    except Exception as e:
        print(f"RAG Retrieval Error: {e}")
        return ""

def generate_rag_context(topic: str, subtopic: str, domain: str) -> str:
    import concurrent.futures
    query = f"{subtopic} in {topic} for {domain} architecture detailed explanation"
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_fetch_rag_context, query)
        return future.result(timeout=RAG_CONTEXT_TIMEOUT_SECONDS)
    except TimeoutError:
        print(f"RAG context timed out after {RAG_CONTEXT_TIMEOUT_SECONDS}s")
        return ""
    except Exception as e:
        print(f"RAG context failed: {type(e).__name__}: {e}")
        return ""
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

def _fetch_rag_context(query: str) -> str:
    print("\n  [1/7] Web search…")
    urls = get_search_results(query, max_results=5)
    if not urls:
        return ""
    
    print("  [2/7] Scraping pages…")
    scraped_text = scrape_pages(urls)
    
    print("  [3/7] RAG vector retrieval…")
    return retrieve_context(query, scraped_text, top_k=5)
