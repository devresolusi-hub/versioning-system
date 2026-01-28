# GitLab CI/CD Integration Guide

This guide explains how to integrate the File Versioning System with GitLab CI/CD pipelines to automatically register build artifacts.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Complete Examples](#complete-examples)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

---

## Overview

The File Versioning System allows you to:
1. Build your application in GitLab CI
2. Upload artifacts to external storage (GitLab Package Registry, CDN, S3, etc.)
3. Register the file version with the versioning system
4. Users can browse and download all versions from the web UI

**Workflow:**
```
GitLab CI Pipeline
  ↓
Build Application
  ↓
Upload to Storage (GitLab Packages, CDN, S3, etc.)
  ↓
Register with Versioning System (POST /api/upload)
  ↓
Users Download from Web UI
```

---

## Prerequisites

### 1. Get an API Key

Contact your system administrator to get an API key for your project. The API key will be used to authenticate upload requests.

### 2. Add API Key to GitLab CI/CD Variables

1. Go to your GitLab project
2. Navigate to **Settings** → **CI/CD** → **Variables**
3. Click **Add Variable**
4. Set:
   - **Key**: `VERSIONING_API_KEY`
   - **Value**: Your API key (e.g., `8xJK2mP9vN3qR7sT1wU4yZ6bC8dE0fG2hI4jK6lM8nO=`)
   - **Type**: Variable
   - **Protected**: ✅ (recommended)
   - **Masked**: ✅ (recommended)
   - **Expanded**: ✅

### 3. Add Versioning System URL

Add another variable for the versioning system URL:
- **Key**: `VERSIONING_URL`
- **Value**: `https://your-versioning-system.com`

---

## Quick Start

### Basic `.gitlab-ci.yml` Example

```yaml
stages:
  - build
  - upload
  - register

variables:
  ARTIFACT_NAME: "myapp"
  
build:
  stage: build
  image: node:20
  script:
    - npm install
    - npm run build
    - zip -r myapp-${CI_COMMIT_TAG}.zip dist/
  artifacts:
    paths:
      - myapp-${CI_COMMIT_TAG}.zip
    expire_in: 1 week
  only:
    - tags

upload_to_storage:
  stage: upload
  image: curlimages/curl:latest
  script:
    # Upload to GitLab Package Registry (Generic Packages)
    - |
      curl --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
           --upload-file myapp-${CI_COMMIT_TAG}.zip \
           "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/myapp-${CI_COMMIT_TAG}.zip"
    
    # Get file size
    - FILE_SIZE=$(stat -c%s "myapp-${CI_COMMIT_TAG}.zip")
    - echo "FILE_SIZE=${FILE_SIZE}" >> build.env
    
    # Construct download URL
    - DOWNLOAD_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/myapp-${CI_COMMIT_TAG}.zip"
    - echo "DOWNLOAD_URL=${DOWNLOAD_URL}" >> build.env
  artifacts:
    reports:
      dotenv: build.env
  only:
    - tags

register_version:
  stage: register
  image: curlimages/curl:latest
  script:
    - |
      curl -X POST "${VERSIONING_URL}/api/upload" \
        -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
        -F "fileName=${ARTIFACT_NAME}" \
        -F "version=${CI_COMMIT_TAG}" \
        -F "fileUrl=${DOWNLOAD_URL}" \
        -F "fileSize=${FILE_SIZE}" \
        -F "fileType=application/zip" \
        -F "metadata={\"commit\":\"${CI_COMMIT_SHA}\",\"branch\":\"${CI_COMMIT_BRANCH}\",\"pipeline\":\"${CI_PIPELINE_ID}\"}"
  only:
    - tags
```

---

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VERSIONING_URL` | URL of your versioning system | `https://versions.example.com` |
| `VERSIONING_API_KEY` | API key for authentication | `8xJK2mP9vN3qR7sT...` |
| `ARTIFACT_NAME` | Name of your application | `myapp` |
| `CI_COMMIT_TAG` | GitLab built-in: Git tag | `v1.0.0` |
| `CI_COMMIT_SHA` | GitLab built-in: Commit hash | `abc123...` |
| `CI_PROJECT_ID` | GitLab built-in: Project ID | `12345` |

### API Request Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `fileName` | ✅ | Application name (alphanumeric, dash, underscore) | `myapp` |
| `version` | ✅ | Version identifier | `1.0.0` or `v1.0.0` |
| `fileUrl` | ✅ | Public download URL | `https://...` |
| `fileSize` | ✅ | File size in bytes | `2048576` |
| `fileType` | ✅ | MIME type | `application/zip` |
| `metadata` | ❌ | Additional metadata (JSON) | `{"commit":"abc123"}` |

---

## Complete Examples

### Example 1: Node.js Application with GitLab Package Registry

```yaml
stages:
  - build
  - deploy

variables:
  ARTIFACT_NAME: "my-nodejs-app"
  VERSIONING_URL: "https://versions.example.com"

build_and_register:
  stage: build
  image: node:20
  script:
    # Build application
    - npm ci
    - npm run build
    - npm run test
    
    # Create archive
    - tar -czf ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz dist/
    
    # Get file info
    - FILE_SIZE=$(stat -c%s "${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz")
    
    # Upload to GitLab Package Registry
    - |
      curl --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
           --upload-file ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz \
           "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz"
    
    # Register with versioning system
    - |
      DOWNLOAD_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz"
      
      curl -X POST "${VERSIONING_URL}/api/upload" \
        -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
        -F "fileName=${ARTIFACT_NAME}" \
        -F "version=${CI_COMMIT_TAG}" \
        -F "fileUrl=${DOWNLOAD_URL}" \
        -F "fileSize=${FILE_SIZE}" \
        -F "fileType=application/gzip" \
        -F "metadata={\"commit\":\"${CI_COMMIT_SHA}\",\"branch\":\"${CI_COMMIT_REF_NAME}\",\"pipeline\":\"${CI_PIPELINE_URL}\"}"
  only:
    - tags
```

### Example 2: Docker Image with External CDN

```yaml
stages:
  - build
  - upload
  - register

variables:
  ARTIFACT_NAME: "my-docker-app"
  CDN_URL: "https://cdn.example.com"

build_image:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t ${ARTIFACT_NAME}:${CI_COMMIT_TAG} .
    - docker save ${ARTIFACT_NAME}:${CI_COMMIT_TAG} | gzip > ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz
  artifacts:
    paths:
      - ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz
    expire_in: 1 day
  only:
    - tags

upload_to_cdn:
  stage: upload
  image: amazon/aws-cli:latest
  script:
    # Upload to S3/CDN (example with AWS S3)
    - |
      aws s3 cp ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz \
        s3://my-bucket/releases/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/ \
        --acl public-read
    
    # Save metadata
    - FILE_SIZE=$(stat -c%s "${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz")
    - echo "FILE_SIZE=${FILE_SIZE}" >> build.env
    - echo "DOWNLOAD_URL=${CDN_URL}/releases/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.tar.gz" >> build.env
  artifacts:
    reports:
      dotenv: build.env
  only:
    - tags

register_version:
  stage: register
  image: curlimages/curl:latest
  script:
    - |
      curl -X POST "${VERSIONING_URL}/api/upload" \
        -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
        -F "fileName=${ARTIFACT_NAME}" \
        -F "version=${CI_COMMIT_TAG}" \
        -F "fileUrl=${DOWNLOAD_URL}" \
        -F "fileSize=${FILE_SIZE}" \
        -F "fileType=application/gzip" \
        -F "metadata={\"commit\":\"${CI_COMMIT_SHA}\",\"dockerImage\":\"${ARTIFACT_NAME}:${CI_COMMIT_TAG}\"}"
  only:
    - tags
```

### Example 3: Multi-Platform Build (Windows/Linux/macOS)

```yaml
stages:
  - build
  - register

.build_template: &build_template
  stage: build
  script:
    - npm ci
    - npm run build:${PLATFORM}
    - FILE_SIZE=$(stat -c%s "${ARTIFACT_NAME}-${CI_COMMIT_TAG}-${PLATFORM}.zip" 2>/dev/null || stat -f%z "${ARTIFACT_NAME}-${CI_COMMIT_TAG}-${PLATFORM}.zip")
    
    # Upload to GitLab Package Registry
    - |
      curl --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
           --upload-file ${ARTIFACT_NAME}-${CI_COMMIT_TAG}-${PLATFORM}.zip \
           "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}-${PLATFORM}.zip"
    
    # Register with versioning system
    - |
      DOWNLOAD_URL="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}-${PLATFORM}.zip"
      
      curl -X POST "${VERSIONING_URL}/api/upload" \
        -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
        -F "fileName=${ARTIFACT_NAME}-${PLATFORM}" \
        -F "version=${CI_COMMIT_TAG}" \
        -F "fileUrl=${DOWNLOAD_URL}" \
        -F "fileSize=${FILE_SIZE}" \
        -F "fileType=application/zip" \
        -F "metadata={\"platform\":\"${PLATFORM}\",\"commit\":\"${CI_COMMIT_SHA}\"}"
  only:
    - tags

build_windows:
  <<: *build_template
  image: node:20-windowsservercore
  variables:
    PLATFORM: "windows"

build_linux:
  <<: *build_template
  image: node:20
  variables:
    PLATFORM: "linux"

build_macos:
  <<: *build_template
  tags:
    - macos
  variables:
    PLATFORM: "macos"
```

### Example 4: Using GitLab Releases

```yaml
stages:
  - build
  - release

variables:
  ARTIFACT_NAME: "myapp"
  PACKAGE_REGISTRY_URL: "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/${ARTIFACT_NAME}/${CI_COMMIT_TAG}"

build:
  stage: build
  image: node:20
  script:
    - npm ci
    - npm run build
    - zip -r ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip dist/
    
    # Upload to Package Registry
    - |
      curl --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
           --upload-file ${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip \
           "${PACKAGE_REGISTRY_URL}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip"
  only:
    - tags

release:
  stage: release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  script:
    - FILE_SIZE=$(curl -sI "${PACKAGE_REGISTRY_URL}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip" | grep -i content-length | awk '{print $2}' | tr -d '\r')
    
    # Register with versioning system
    - |
      curl -X POST "${VERSIONING_URL}/api/upload" \
        -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
        -F "fileName=${ARTIFACT_NAME}" \
        -F "version=${CI_COMMIT_TAG}" \
        -F "fileUrl=${PACKAGE_REGISTRY_URL}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip" \
        -F "fileSize=${FILE_SIZE}" \
        -F "fileType=application/zip" \
        -F "metadata={\"commit\":\"${CI_COMMIT_SHA}\",\"releaseUrl\":\"${CI_PROJECT_URL}/-/releases/${CI_COMMIT_TAG}\"}"
  release:
    tag_name: '$CI_COMMIT_TAG'
    description: 'Release $CI_COMMIT_TAG'
    assets:
      links:
        - name: 'Download ${ARTIFACT_NAME}'
          url: '${PACKAGE_REGISTRY_URL}/${ARTIFACT_NAME}-${CI_COMMIT_TAG}.zip'
  only:
    - tags
```

---

## Advanced Usage

### Using Different Storage Providers

#### AWS S3

```yaml
upload_to_s3:
  stage: upload
  image: amazon/aws-cli:latest
  script:
    - aws s3 cp myapp.zip s3://my-bucket/releases/myapp-${CI_COMMIT_TAG}.zip --acl public-read
    - DOWNLOAD_URL="https://my-bucket.s3.amazonaws.com/releases/myapp-${CI_COMMIT_TAG}.zip"
```

#### Azure Blob Storage

```yaml
upload_to_azure:
  stage: upload
  image: mcr.microsoft.com/azure-cli:latest
  script:
    - az storage blob upload --account-name myaccount --container-name releases --name myapp-${CI_COMMIT_TAG}.zip --file myapp.zip
    - DOWNLOAD_URL="https://myaccount.blob.core.windows.net/releases/myapp-${CI_COMMIT_TAG}.zip"
```

#### Google Cloud Storage

```yaml
upload_to_gcs:
  stage: upload
  image: google/cloud-sdk:alpine
  script:
    - gcloud storage cp myapp.zip gs://my-bucket/releases/myapp-${CI_COMMIT_TAG}.zip
    - gsutil acl ch -u AllUsers:R gs://my-bucket/releases/myapp-${CI_COMMIT_TAG}.zip
    - DOWNLOAD_URL="https://storage.googleapis.com/my-bucket/releases/myapp-${CI_COMMIT_TAG}.zip"
```

### Dynamic Version from package.json

```yaml
variables:
  ARTIFACT_NAME: "myapp"

build:
  stage: build
  image: node:20
  script:
    - VERSION=$(node -p "require('./package.json').version")
    - echo "Building version ${VERSION}"
    - npm ci
    - npm run build
    - zip -r ${ARTIFACT_NAME}-${VERSION}.zip dist/
    
    # Continue with upload and registration...
```

### Conditional Registration (Only for Production)

```yaml
register_version:
  stage: register
  script:
    - # ... registration script
  only:
    - tags
    - /^v\d+\.\d+\.\d+$/  # Only semantic version tags
  except:
    - branches
```

### Retry on Failure

```yaml
register_version:
  stage: register
  script:
    - # ... registration script
  retry:
    max: 3
    when:
      - api_failure
      - runner_system_failure
```

---

## Troubleshooting

### Common Issues

#### 1. **401 Unauthorized**

**Problem:** API key is invalid or missing

**Solution:**
- Verify `VERSIONING_API_KEY` is set in GitLab CI/CD variables
- Check that the API key is active in the versioning system
- Ensure the variable is not expired or masked incorrectly

#### 2. **409 Conflict - Version Already Exists**

**Problem:** Trying to upload a version that already exists

**Solution:**
- Use unique version numbers (e.g., `${CI_COMMIT_TAG}` or `${CI_COMMIT_SHA}`)
- Check existing versions in the web UI before uploading
- Consider using build numbers: `1.0.0-build.${CI_PIPELINE_ID}`

#### 3. **400 Bad Request - Invalid fileName**

**Problem:** fileName contains invalid characters

**Solution:**
- Use only alphanumeric characters, dashes, and underscores
- Valid: `my-app`, `myapp`, `my_app_123`
- Invalid: `my.app`, `my app`, `my@app`

#### 4. **File URL Not Accessible**

**Problem:** The versioning system or users cannot download the file

**Solution:**
- Ensure the file URL is publicly accessible
- Check storage permissions (S3 ACL, GitLab Package visibility)
- Test the URL in a browser or with `curl`

#### 5. **File Size Calculation Fails**

**Problem:** `stat` command syntax differs between systems

**Solution:**
```bash
# Linux
FILE_SIZE=$(stat -c%s "file.zip")

# macOS
FILE_SIZE=$(stat -f%z "file.zip")

# Universal (using wc)
FILE_SIZE=$(wc -c < "file.zip" | tr -d ' ')
```

### Debug Mode

Add this to your script for debugging:

```yaml
script:
  - set -x  # Enable debug output
  - echo "VERSIONING_URL=${VERSIONING_URL}"
  - echo "ARTIFACT_NAME=${ARTIFACT_NAME}"
  - echo "VERSION=${CI_COMMIT_TAG}"
  - echo "FILE_SIZE=${FILE_SIZE}"
  - echo "DOWNLOAD_URL=${DOWNLOAD_URL}"
  
  # Your actual commands...
```

### Testing Locally

Test your API call locally before adding to CI:

```bash
# Set variables
export VERSIONING_URL="https://versions.example.com"
export VERSIONING_API_KEY="your-api-key"
export FILE_URL="https://example.com/myapp-1.0.0.zip"

# Test the API
curl -v -X POST "${VERSIONING_URL}/api/upload" \
  -H "Authorization: Bearer ${VERSIONING_API_KEY}" \
  -F "fileName=myapp" \
  -F "version=1.0.0" \
  -F "fileUrl=${FILE_URL}" \
  -F "fileSize=2048576" \
  -F "fileType=application/zip" \
  -F 'metadata={"test":"true"}'
```

---

## Best Practices

1. **Use Semantic Versioning**: `v1.0.0`, `v1.2.3-beta.1`
2. **Include Metadata**: Add commit hash, branch, pipeline URL for traceability
3. **Protect API Keys**: Always use masked and protected variables
4. **Test Before Tagging**: Test your pipeline on branches before creating tags
5. **Use Artifacts Expiration**: Set reasonable expiration for GitLab artifacts
6. **Monitor Pipeline**: Check pipeline logs for registration success
7. **Document Versions**: Use meaningful version tags and release notes

---

## Support

For more information:
- **System Design**: See `docs/SDD.md`
- **Developer Guide**: See `docs/DEVELOPER.md`
- **API Documentation**: See `docs/SDD.md` section 4.3

For issues or questions, contact your system administrator.
