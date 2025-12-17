-- Migration: Create file_metadata table
-- Description: Primary table for tracking unique files

CREATE TABLE file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_file_metadata_name ON file_metadata(file_name);

-- Comments for documentation
COMMENT ON TABLE file_metadata IS 'Primary table for tracking unique files';
COMMENT ON COLUMN file_metadata.file_name IS 'Base file name (e.g., "myapp", "tool-installer")';
COMMENT ON COLUMN file_metadata.created_at IS 'First upload timestamp';
COMMENT ON COLUMN file_metadata.updated_at IS 'Last modification timestamp';

