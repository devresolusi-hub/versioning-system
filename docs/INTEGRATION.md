# CI/CD INTEGRATION GUIDE

This document explains how to integrate your CI/CD pipelines with the File Versioning System via the `POST /api/upload` endpoint.

---

## 1. Overview

- **Endpoint**: `POST /api/upload`
- **Auth**: API key via `Authorization: Bearer <API_KEY>`
- **Content-Type**: `multipart/form-data`
- **Purpose**: Upload a new **version** of a logical file (e.g. `myapp`).

Once uploaded, versions appear on the public home page (`GET /`) with download links.

---

## 2. API Key Management

### 2.1 Concept

API keys are stored in the `api_keys` table in Supabase:

- `key_name` – descriptive name (e.g. `github-actions-main`).
- `key_value` – actual secret used as Bearer token.
- `is_active` – soft-enable/disable flag.
- `last_used_at` – updated on each successful upload.

The `/api/upload` endpoint:

- Looks up `key_value` where `is_active = TRUE`.
- Rejects missing/invalid/inactive keys with **401 Unauthorized**.

### 2.2 Creating keys

How you create keys is up to you (SQL, dashboard, scripts). A typical SQL pattern:

```sql
INSERT INTO api_keys (key_name, key_value)
VALUES (
  'github-actions-main',
  encode(gen_random_bytes(32), 'base64')
)
RETURNING key_name, key_value;
```

Use the returned `key_value` as your CI/CD secret.

### 2.3 Revoking keys

```sql
UPDATE api_keys
SET is_active = FALSE
WHERE key_name = 'github-actions-main';
```

---

## 3. Upload API Details

### 3.1 Request

- **Method**: `POST`
- **Path**: `/api/upload`
- **Headers**:

  ```http
  Authorization: Bearer YOUR_API_KEY_HERE
  Content-Type: multipart/form-data; boundary=----WebKitFormBoundary
  ```

- **Form fields**:

  | Field    | Type   | Required | Description                                            |
  |----------|--------|----------|--------------------------------------------------------|
  | `file`   | File   | Yes      | Binary artifact (zip, exe, etc.)                      |
  | `fileName` | String | Yes    | Logical file name (`[A-Za-z0-9_-]+`, e.g. `myapp`)    |
  | `version`  | String | Yes    | Version string (`[A-Za-z0-9._-]+`, e.g. `1.0.0`)      |
  | `metadata` | JSON   | No     | JSON string (build info, commit hash, etc.)           |

Constraints:

- Max file size: **100MB** (returns **413 Payload Too Large** if exceeded).
- Duplicate `(fileName, version)` rejected with **409 Conflict**.

### 3.2 Success response (201)

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "fileMetadataId": "uuid-here",
    "versionId": "uuid-here",
    "fileName": "myapp",
    "version": "1.0.0",
    "storagePath": "files/myapp/1.0.0/myapp-v1.0.0.zip",
    "fileSize": 2048576,
    "fileType": "application/zip",
    "downloadUrl": "https://your-project.supabase.co/storage/v1/object/public/files/myapp/1.0.0/myapp-v1.0.0.zip",
    "uploadedAt": "2025-12-16T10:30:00Z",
    "uploadedBy": "github-actions-main"
  }
}
```

### 3.3 Common error responses

- **401 Unauthorized**
  - Missing/invalid/inactive API key.
- **400 Bad Request**
  - Missing `file`, `fileName`, or `version`.
  - Invalid `fileName`/`version` format.
  - Invalid `metadata` JSON.
- **409 Conflict**
  - Version already exists for that `fileName`.
- **413 Payload Too Large**
  - File exceeds 100MB.
- **500 Internal Server Error**
  - Unexpected server/storage/DB error.

See `SDD.md` for full error payload examples.

---

## 4. cURL Examples

### 4.1 Basic upload

```bash
curl -X POST https://your-domain.com/api/upload \
  -H "Authorization: Bearer $UPLOAD_API_KEY" \
  -F "file=@./dist/myapp-1.0.0.zip" \
  -F "fileName=myapp" \
  -F "version=1.0.0" \
  -F 'metadata={"commit":"abc123","branch":"main"}'
```

### 4.2 Retry on conflict (pseudo)

If you deploy with the same version tag multiple times, handle `409 Conflict` and either:

- Bump the version (preferred), or
- Treat as a no-op (if you consider re-uploads equivalent).

---

## 5. GitHub Actions Integration

Example workflow snippet:

```yaml
# .github/workflows/upload-release.yml
name: Upload Release Artifact

on:
  release:
    types: [published]

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build
        run: |
          pnpm install
          pnpm build
          zip -r myapp-${{ github.event.release.tag_name }}.zip build/

      - name: Upload to File Versioning System
        env:
          UPLOAD_API_KEY: ${{ secrets.UPLOAD_API_KEY }}
        run: |
          curl -X POST https://your-domain.com/api/upload \
            -H "Authorization: Bearer $UPLOAD_API_KEY" \
            -F "file=@myapp-${{ github.event.release.tag_name }}.zip" \
            -F "fileName=myapp" \
            -F "version=${{ github.event.release.tag_name }}" \
            -F 'metadata={"commit":"${{ github.sha }}","branch":"main"}'
```

**Setup:**

1. In Supabase, create an API key in `api_keys` (e.g. `github-actions-main`).
2. Copy `key_value`.
3. In GitHub → Repo Settings → Secrets and variables → Actions:
   - Add secret `UPLOAD_API_KEY` with the key value.

---

## 6. Other CI Systems (Conceptual)

The same pattern applies to:

- **GitLab CI** – use `$UPLOAD_API_KEY` as a masked variable.
- **Jenkins** – use “Secret text” credentials and inject as env var.
- **Any CI** – as long as it can:
  - Store a secret,
  - Run a `curl` (or similar HTTP client),
  - Attach a file as multipart.

Translate the GitHub Actions example into your CI’s syntax.

---

## 7. Best Practices

- Use **one key per pipeline** (e.g. `github-actions-main`, `gitlab-ci-prod`).
- Rotate keys periodically and revoke unused ones.
- Use **semantic versioning** or build numbers in `version`.
- Ensure `fileName` is stable per logical artifact (e.g. always `myapp` for the same product).
- Treat `409 Conflict` as a signal that a version was already published.

For deeper security and monitoring guidance, see `SDD.md` (API key management section).


