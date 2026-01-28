-- Migration: Create versions table
-- Description: Tracks individual versions of each file

CREATE TABLE versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_metadata_id UUID NOT NULL REFERENCES file_metadata(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    is_latest BOOLEAN DEFAULT FALSE,
    uploaded_by VARCHAR(100),
    
    UNIQUE(file_metadata_id, version)
);

-- Indexes for performance
CREATE INDEX idx_versions_file_metadata ON versions(file_metadata_id);
CREATE INDEX idx_versions_latest ON versions(is_latest) WHERE is_latest = TRUE;
CREATE INDEX idx_versions_uploaded ON versions(uploaded_at DESC);
CREATE INDEX idx_versions_uploaded_by ON versions(uploaded_by);

-- Comments for documentation
COMMENT ON TABLE versions IS 'Tracks individual versions of each file';
COMMENT ON COLUMN versions.version IS 'Version string (e.g., "1.0.0", "2.1.3", "build-123")';
COMMENT ON COLUMN versions.file_url IS 'Full Download URL';
COMMENT ON COLUMN versions.file_size IS 'File size in bytes';
COMMENT ON COLUMN versions.file_type IS 'MIME type (e.g., "application/zip")';
COMMENT ON COLUMN versions.metadata IS 'Additional metadata (commit hash, build info, release notes)';
COMMENT ON COLUMN versions.is_latest IS 'Boolean flag to mark the latest version';
COMMENT ON COLUMN versions.uploaded_by IS 'Name of the API key used for upload (for tracking)';

