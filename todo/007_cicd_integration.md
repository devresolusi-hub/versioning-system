# 007 – CI/CD Integration & Examples

## Tasks
- [ ] Create API key management scripts
  - [ ] Create `scripts/create-api-key.js` (or `.mjs`)
    - [ ] Accept key name as argument
    - [ ] Generate cryptographically secure random key (32 bytes, base64)
    - [ ] Insert into `api_keys` table using service role client
    - [ ] Output key value for user to copy
    - [ ] Add usage instructions
  - [ ] Create `scripts/list-api-keys.js` (or `.mjs`)
    - [ ] Query and display all API keys with status
    - [ ] Show key_name, created_at, last_used_at, is_active
  - [ ] Create `scripts/revoke-api-key.js` (or `.mjs`)
    - [ ] Accept key name as argument
    - [ ] Set `is_active = FALSE` for specified key
- [ ] Create GitHub Actions workflow example
  - [ ] Create `.github/workflows/upload-release.yml`
    - [ ] Trigger on release published
    - [ ] Build application step
    - [ ] Upload to file versioning system step
    - [ ] Use `${{ secrets.UPLOAD_API_KEY }}` for authentication
    - [ ] Include example with curl command
- [ ] Create GitLab CI example
  - [ ] Create `.gitlab-ci.yml.example`
    - [ ] Upload stage configuration
    - [ ] Use `$UPLOAD_API_KEY` variable
    - [ ] Include example curl command
- [ ] Create Jenkins example
  - [ ] Create `jenkins-pipeline-example.groovy`
    - [ ] Pipeline configuration
    - [ ] Credential usage example
    - [ ] Upload step with curl
- [ ] Create manual upload examples
  - [ ] Create `examples/upload-curl.sh`
    - [ ] Example curl command with all parameters
    - [ ] Comments explaining each part
  - [ ] Create `examples/upload-python.py`
    - [ ] Python script example using requests library
    - [ ] Function to upload file with metadata
    - [ ] Error handling and response parsing
- [ ] Document CI/CD integration
  - [ ] Add section to README on CI/CD setup
  - [ ] Document how to get API key
  - [ ] Document how to add API key to CI/CD secrets
  - [ ] Include links to examples

## Files to Create
- `scripts/create-api-key.js`
- `scripts/list-api-keys.js`
- `scripts/revoke-api-key.js`
- `.github/workflows/upload-release.yml`
- `.gitlab-ci.yml.example`
- `jenkins-pipeline-example.groovy`
- `examples/upload-curl.sh`
- `examples/upload-python.py`

## Commands to Run
```bash
# Create new API key
node scripts/create-api-key.js github-actions-main

# List all API keys
node scripts/list-api-keys.js

# Revoke API key
node scripts/revoke-api-key.js old-key-name
```

## Expected Outcome
- Scripts for managing API keys
- CI/CD workflow examples for major platforms
- Manual upload examples in multiple languages
- Documentation for integrating with CI/CD pipelines

