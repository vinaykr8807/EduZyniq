-- Storage bucket for optional FAISS RAG vector artifacts.
-- Stores:
-- - knowledge-base/faiss.index
-- - knowledge-base/embeddings.npy
-- - knowledge-base/metadata.json

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rag-vectors',
  'rag-vectors',
  false,
  52428800,
  ARRAY['application/octet-stream', 'application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Service role all access - rag-vectors" ON storage.objects;
CREATE POLICY "Service role all access - rag-vectors"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'rag-vectors')
  WITH CHECK (bucket_id = 'rag-vectors');
