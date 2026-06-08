import os
import numpy as np
from typing import List, Optional

RAG_VECTOR_BACKEND = os.getenv("RAG_VECTOR_BACKEND", "numpy").lower()
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
    global embedding_model
    if embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print(f"Failed to load sentence transformer for Personal RAG: {e}")
            return None
    return embedding_model

def get_personal_context(user_email: str, query: str, supabase_client, top_k: int = 3) -> str:
    """Fetch user's past doubts and AI teacher explanations to provide context."""
    model = _get_embedding_model()
    if model is None or not user_email:
        return ""

    try:
        # 1. Fetch user ID
        user_res = supabase_client.table('users').select('id').eq('email', user_email).execute()
        if not user_res.data:
            return ""
        user_id = user_res.data[0]['id']

        # 2. Fetch past teacher interactions
        # We look for TEACHER_DOUBT mode carefully
        chat_res = supabase_client.table('chat_messages').select('role, content').eq('user_id', user_id).eq('mode', 'TEACHER_DOUBT').order('timestamp', desc=True).limit(50).execute()
        
        if not chat_res.data:
            return ""

        # 3. Prepare texts
        interactions = []
        for msg in chat_res.data:
            interactions.append(f"{'Student' if msg['role'] == 'user' else 'Teacher'}: {msg['content']}")
        
        if not interactions:
            return ""

        # 4. Vectorize and Search
        interaction_embeddings = np.array(model.encode(interactions)).astype('float32')
        query_embedding = np.array(model.encode([query])).astype('float32')

        faiss = _get_faiss()
        if faiss is not None:
            index = faiss.IndexFlatL2(interaction_embeddings.shape[1])
            index.add(interaction_embeddings)
            _, search_indices = index.search(query_embedding, top_k)
            indices = search_indices[0]
        else:
            distances = np.linalg.norm(interaction_embeddings - query_embedding[0], axis=1)
            indices = np.argsort(distances)[:top_k]
        
        # 5. Build context string
        context_parts = []
        for idx in indices:
            if idx < len(interactions):
                context_parts.append(interactions[int(idx)])
        
        if not context_parts:
            return ""

        return "\n\nPAST LEARNING CONTEXT:\n" + "\n---\n".join(context_parts)
    except Exception as e:
        print(f"Personal RAG Error: {e}")
        return ""

def save_teacher_interaction(user_email: str, role: str, content: str, supabase_client):
    """Save a doubt or an answer to student's history for future RAG."""
    if not user_email:
        return

    try:
        user_res = supabase_client.table('users').select('id').eq('email', user_email).execute()
        if not user_res.data:
            return
        user_id = user_res.data[0]['id']

        supabase_client.table('chat_messages').insert({
            'user_id': user_id,
            'role': role,
            'content': content,
            'mode': 'TEACHER_DOUBT'
        }).execute()
    except Exception as e:
        print(f"Error saving teacher interaction: {e}")
