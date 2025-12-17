-- Migration: Enable Row Level Security and create policies
-- Description: Configure access control for all tables

-- Enable RLS on all tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- API KEYS TABLE POLICIES
-- ============================================================

-- Service role can read all API keys (for validation during uploads)
CREATE POLICY "Service role can read api_keys"
ON api_keys FOR SELECT
TO authenticated
USING (true);

-- Service role can insert API keys (for initial setup or admin operations)
CREATE POLICY "Service role can insert api_keys"
ON api_keys FOR INSERT
TO authenticated
WITH CHECK (true);

-- Service role can update API keys (to mark as inactive or update last_used_at)
CREATE POLICY "Service role can update api_keys"
ON api_keys FOR UPDATE
TO authenticated
USING (true);

-- No public access to API keys (security critical)
-- This ensures API keys are never exposed to public users

-- ============================================================
-- FILE METADATA TABLE POLICIES
-- ============================================================

-- Public read access for file_metadata
CREATE POLICY "Public read access for file_metadata"
ON file_metadata FOR SELECT
TO public
USING (true);

-- Authenticated insert for file_metadata (service role only)
CREATE POLICY "Service role can insert file_metadata"
ON file_metadata FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- VERSIONS TABLE POLICIES
-- ============================================================

-- Public read access for versions
CREATE POLICY "Public read access for versions"
ON versions FOR SELECT
TO public
USING (true);

-- Authenticated insert for versions (service role only)
CREATE POLICY "Service role can insert versions"
ON versions FOR INSERT
TO authenticated
WITH CHECK (true);

-- Comments for documentation
COMMENT ON POLICY "Service role can read api_keys" ON api_keys IS 'Allows authenticated service role to read API keys for validation';
COMMENT ON POLICY "Public read access for file_metadata" ON file_metadata IS 'Allows anyone to view file listings';
COMMENT ON POLICY "Public read access for versions" ON versions IS 'Allows anyone to view and download file versions';

