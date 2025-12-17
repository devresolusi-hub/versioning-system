-- Seeder: Insert sample API keys for testing
-- Description: Creates example API keys for CI/CD pipeline testing
-- Note: These are example keys. In production, generate secure random keys using:
--       encode(gen_random_bytes(32), 'base64')

-- Insert sample API keys
INSERT INTO api_keys (key_name, key_value) VALUES
('github-actions-main', '8xJK2mP9vN3qR7sT1wU4yZ6bC8dE0fG2hI4jK6lM8nO='),
('gitlab-ci-production', 'pL9mK8nJ7hG6fE5dC4bA3zY2xW1vU0tS9rQ8pO7nM6L='),
('jenkins-build-server', 'qR8sT7uV6wX5yZ4aB3cD2eF1gH0iJ9kL8mN7oP6qR5s=')
ON CONFLICT (key_name) DO NOTHING;

-- Verify insertion
SELECT 
    key_name,
    created_at,
    is_active,
    'Sample API key created' as status
FROM api_keys
WHERE key_name IN ('github-actions-main', 'gitlab-ci-production', 'jenkins-build-server')
ORDER BY created_at DESC;

