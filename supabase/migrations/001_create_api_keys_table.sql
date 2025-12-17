-- Migration: Create api_keys table
-- Description: Stores API keys for authenticating upload requests from CI/CD pipelines

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name VARCHAR(100) NOT NULL UNIQUE,
    key_value VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes for faster lookups
CREATE INDEX idx_api_keys_key_value ON api_keys(key_value) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- Comments for documentation
COMMENT ON TABLE api_keys IS 'Stores API keys for authenticating upload requests from CI/CD pipelines';
COMMENT ON COLUMN api_keys.key_name IS 'Human-readable name for the API key (e.g., "github-actions", "gitlab-ci")';
COMMENT ON COLUMN api_keys.key_value IS 'The actual API key string (stored in plain text for validation)';
COMMENT ON COLUMN api_keys.is_active IS 'Whether the key is currently active (allows soft deletion/revocation)';

