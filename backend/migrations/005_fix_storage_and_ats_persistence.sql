-- =====================================================
-- Edunovas Supabase Migration: Storage & ATS Persistence
-- Dashboard: https://supabase.com/dashboard/project/wlnybmztpkocfbnoacgs/sql
-- =====================================================

-- 1. FIX: Update the 'resumes' bucket to support text/plain files
-- This resolves: {'statusCode': 400, 'error': InvalidRequest, 'message': mime type text/plain is not supported}
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'image/jpeg', 
    'image/png', 
    'text/plain',
    'application/msword'
]
WHERE id = 'resumes';

-- 2. ENHANCEMENT: Add ats_score column to interview_sessions to persist analysis results
ALTER TABLE interview_sessions 
ADD COLUMN IF NOT EXISTS ats_score JSONB DEFAULT '{}'::jsonb;

-- 3. RE-VERIFY: Ensure service_role has access (usually already done, but safe)
DROP POLICY IF EXISTS "Service role all access - resumes" ON storage.objects;
CREATE POLICY "Service role all access - resumes"
  ON storage.objects FOR ALL
  TO service_role USING (bucket_id = 'resumes') WITH CHECK (bucket_id = 'resumes');
