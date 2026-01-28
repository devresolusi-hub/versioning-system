# System Design Document (SDD)
## File Versioning System with SvelteKit & Supabase

**Version:** 1.0  
**Date:** December 16, 2025  
**Author:** System Architect

---

## 1. OVERVIEW

### 1.1 Purpose
A lightweight file versioning system that allows automated CI/CD pipelines to upload versioned files and provides a simple web interface for users to browse and download the latest versions.

### 1.2 Scope
- Public file listing and download interface
- Authenticated API endpoint for file uploads (CI/CD integration)
- Version tracking for uploaded files
- No delete, update, or admin UI features

### 1.3 Technology Stack
- **Frontend/Backend:** SvelteKit (SSR + API routes)
- **Database:** Supabase (PostgreSQL)
- **Storage:** External (clients provide pre-uploaded file URLs)
- **Deployment:** Vercel/Netlify (recommended)

---

## 2. SYSTEM ARCHITECTURE

### 2.1 High-Level Architecture

```
┌─────────────────┐
│   End Users     │
│  (Web Browser)  │
└────────┬────────┘
         │ GET /
         ▼
┌─────────────────────────────────────┐
│        SvelteKit Application        │
│  ┌─────────────┐  ┌──────────────┐ │
│  │   / (Home)  │  │ /api/upload  │ │
│  │   (Public)  │  │ (Protected)  │ │
│  └──────┬──────┘  └──────┬───────┘ │
└─────────┼─────────────────┼─────────┘
          │                 │
          │                 │ API Key Auth
          ▼                 ▼
┌─────────────────────────────────────┐
│         Supabase Services           │
│  ┌──────────────┐  ┌─────────────┐ │
│  │  PostgreSQL  │  │   Storage   │ │
│  │   Database   │  │   Bucket    │ │
│  └──────────────┘  └─────────────┘ │
└─────────────────────────────────────┘
          ▲
          │ POST /api/upload
          │
┌─────────┴────────┐
│   CI/CD Pipeline │
│ (GitHub Actions, │
│  GitLab CI, etc) │
└──────────────────┘
```

### 2.2 Component Breakdown

#### 2.2.1 Frontend Layer
- **Route: `/` (Home Page)**
  - Server-side rendered page
  - Lists all files with their versions
  - Provides download links
  - No authentication required

#### 2.2.2 API Layer
- **Route: `/api/upload` (Upload Endpoint)**
  - Accepts form data with file metadata
  - Validates API key authentication
  - Registers file version with provided URL
  - Creates database records

#### 2.2.3 Data Layer
- **Supabase PostgreSQL Database**
  - Stores file metadata and version information
  - Manages relationships between files and versions
  - Stores file URLs (files hosted externally)

---

## 3. DATABASE SCHEMA

### 3.1 Entity Relationship Diagram

```
┌─────────────────────┐
│     api_keys        │
├─────────────────────┤
│ id (PK)             │
│ key_name            │
│ key_value           │
│ created_at          │
│ last_used_at        │
│ is_active           │
└─────────────────────┘

┌─────────────────────┐
│   file_metadata     │
├─────────────────────┤
│ id (PK)             │◄──┐
│ file_name           │   │
│ created_at          │   │
│ updated_at          │   │
└─────────────────────┘   │
                          │
                          │ 1:N
                          │
┌─────────────────────┐   │
│      versions       │   │
├─────────────────────┤   │
│ id (PK)             │   │
│ file_metadata_id(FK)├───┘
│ version             │
│ storage_path        │
│ file_size           │
│ file_type           │
│ uploaded_at         │
│ metadata (jsonb)    │
│ is_latest           │
│ uploaded_by         │
└─────────────────────┘
```

### 3.2 Table Definitions

#### Table: `api_keys`
Stores API keys for authenticating upload requests from CI/CD pipelines.

```sql
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
```

**Columns:**
- `id`: Unique identifier (UUID)
- `key_name`: Human-readable name for the API key (e.g., "github-actions", "gitlab-ci")
- `key_value`: The actual API key string (stored in plain text for validation)
- `created_at`: When the API key was created
- `last_used_at`: Last time this API key was used for an upload
- `is_active`: Whether the key is currently active (allows soft deletion/revocation)

**Constraints:**
- `key_name` must be unique (prevents duplicate names)
- `key_value` must be unique (prevents duplicate keys)

**Security Notes:**
- Keys are stored in plain text because they need to be validated on each request
- Keys should be long, random strings (32+ characters)
- Use UUID v4 or cryptographically secure random generation
- Keys can be revoked by setting `is_active = FALSE`

**Example API Keys:**
```sql
INSERT INTO api_keys (key_name, key_value) VALUES
('github-actions-main', '8xJK2mP9vN3qR7sT1wU4yZ6bC8dE0fG2hI4jK6lM8nO='),
('gitlab-ci-production', 'pL9mK8nJ7hG6fE5dC4bA3zY2xW1vU0tS9rQ8pO7nM6L='),
('jenkins-build-server', 'qR8sT7uV6wX5yZ4aB3cD2eF1gH0iJ9kL8mN7oP6qR5s=');
```

---

#### Table: `file_metadata`
Primary table for tracking unique files.

```sql
CREATE TABLE file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_file_metadata_name ON file_metadata(file_name);
```

**Columns:**
- `id`: Unique identifier (UUID)
- `file_name`: Base file name (e.g., "myapp", "tool-installer")
- `created_at`: First upload timestamp
- `updated_at`: Last modification timestamp

---

#### Table: `versions`
Tracks individual versions of each file.

```sql
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
CREATE INDEX idx_versions_file_metadata ON versions(file_metadata_id);
CREATE INDEX idx_versions_latest ON versions(is_latest) WHERE is_latest = TRUE;
CREATE INDEX idx_versions_uploaded ON versions(uploaded_at DESC);
CREATE INDEX idx_versions_uploaded_by ON versions(uploaded_by);
```

**Columns:**
- `id`: Unique identifier (UUID)
- `file_metadata_id`: Foreign key to file_metadata
- `version`: Version string (e.g., "1.0.0", "2.1.3", "build-123")
- `file_url`: Full Download URL
- `file_size`: File size in bytes
- `file_type`: MIME type (e.g., "application/zip")
- `uploaded_at`: Upload timestamp
- `metadata`: Additional metadata (commit hash, build info, release notes)
- `is_latest`: Boolean flag to mark the latest version
- `uploaded_by`: Name of the API key used for upload (for tracking)

**Constraints:**
- Unique constraint on (file_metadata_id, version) prevents duplicate versions
- Cascade delete: Deleting file_metadata removes all versions

---

### 3.3 Storage Structure

**External Storage:** Files are hosted on external storage providers (e.g., CDN, cloud storage, file servers)

**Database Storage:**
- The `versions` table stores the complete `file_url` for each version
- URLs can point to any accessible location (CDN, S3, Azure Blob, etc.)
- No specific path convention is enforced

**Example URLs:**
```
https://cdn.example.com/releases/myapp/1.0.0/myapp-v1.0.0.zip
https://storage.example.com/files/tool-installer-1.5.0.exe
https://github.com/user/repo/releases/download/v2.0.1/app.zip
```

---

### 3.4 Database Functions & Triggers

#### Function: Update Latest Version Flag

```sql
-- Function to automatically mark the latest version
CREATE OR REPLACE FUNCTION update_latest_version()
RETURNS TRIGGER AS $$
BEGIN
    -- Unmark all previous versions as latest
    UPDATE versions 
    SET is_latest = FALSE 
    WHERE file_metadata_id = NEW.file_metadata_id;
    
    -- Mark the new version as latest
    UPDATE versions 
    SET is_latest = TRUE 
    WHERE id = NEW.id;
    
    -- Update the file_metadata updated_at timestamp
    UPDATE file_metadata 
    SET updated_at = NOW() 
    WHERE id = NEW.file_metadata_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on insert
CREATE TRIGGER trigger_update_latest_version
AFTER INSERT ON versions
FOR EACH ROW
EXECUTE FUNCTION update_latest_version();
```

---

### 3.5 Row Level Security (RLS) Policies

```sql
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
```

**Policy Explanation:**

1. **api_keys Table:**
   - **SELECT (authenticated only):** Service role can read keys to validate upload requests
   - **INSERT (authenticated only):** Service role can create new API keys
   - **UPDATE (authenticated only):** Service role can update `last_used_at` and revoke keys
   - **NO PUBLIC ACCESS:** Critical for security - API keys must never be exposed to public

2. **file_metadata Table:**
   - **SELECT (public):** Anyone can view file listings
   - **INSERT (authenticated only):** Only service role (via API) can create new file entries

3. **versions Table:**
   - **SELECT (public):** Anyone can view and download versions
   - **INSERT (authenticated only):** Only service role (via API) can upload new versions

**Security Model:**
- Public users: Read-only access to files and versions
- Service role (SvelteKit API): Full CRUD access for uploads
- API keys: Completely hidden from public, only accessible by service role

---

## 4. REST API SPECIFICATION

### 4.1 API Endpoints Overview

| Method | Endpoint       | Auth Required | Description                    |
|--------|----------------|---------------|--------------------------------|
| GET    | /              | No            | View all files and versions    |
| POST   | /api/upload    | Yes (API Key) | Upload a new file version      |

---

### 4.2 GET / (Home Page)

**Description:** Server-rendered page displaying all files with their versions.

**Authentication:** None (Public)

**Response Type:** HTML

**Data Fetched:**
```sql
SELECT 
    fm.id,
    fm.file_name,
    fm.created_at,
    json_agg(
        json_build_object(
            'id', v.id,
            'version', v.version,
            'file_size', v.file_size,
            'file_type', v.file_type,
            'uploaded_at', v.uploaded_at,
            'file_url', v.file_url,
            'is_latest', v.is_latest
        ) ORDER BY v.uploaded_at DESC
    ) as versions
FROM file_metadata fm
LEFT JOIN versions v ON fm.id = v.file_metadata_id
GROUP BY fm.id
ORDER BY fm.updated_at DESC;
```

**UI Display:**
- Group by file_name
- Show latest version first (badge: "Latest")
- Display version, file size, upload date
- Provide download button/link

---

### 4.3 POST /api/upload

**Description:** Upload a new file version to the system.

**Authentication:** Required (API Key via Bearer token)

**Content-Type:** `multipart/form-data`

#### Request Headers
```http
POST /api/upload HTTP/1.1
Host: your-domain.com
Authorization: Bearer YOUR_API_KEY_HERE
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary
```

#### Request Body (Form Data)
```
fileName: "myapp" (required)
version: "1.0.0" (required)
fileUrl: "https://cdn.example.com/myapp-1.0.0.zip" (required)
fileSize: "2048576" (required, bytes as string)
fileType: "application/zip" (required)
metadata: {"commit": "abc123", "branch": "main"} (optional, JSON string)
```

**Form Fields:**

| Field      | Type   | Required | Description                              |
|------------|--------|----------|------------------------------------------|
| fileName   | String | Yes      | Base file name (alphanumeric, dash, underscore) |
| version    | String | Yes      | Version identifier (semantic versioning recommended) |
| fileUrl    | String | Yes      | Pre-uploaded file URL (must be accessible) |
| fileSize   | String | Yes      | File size in bytes                       |
| fileType   | String | Yes      | MIME type (e.g., "application/zip")     |
| metadata   | JSON   | No       | Additional metadata (commit, build info) |

#### Success Response (201 Created)
```json
{
  "success": true,
  "message": "File version registered successfully",
  "data": {
    "fileMetadataId": "uuid-here",
    "versionId": "uuid-here",
    "fileName": "myapp",
    "version": "1.0.0",
    "fileUrl": "https://cdn.example.com/myapp-1.0.0.zip",
    "fileSize": 2048576,
    "fileType": "application/zip",
    "uploadedAt": "2025-12-16T10:30:00Z",
    "uploadedBy": "github-actions-main"
  }
}
```

#### Error Responses

**401 Unauthorized** - Missing or invalid API key
```json
{
  "success": false,
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

**400 Bad Request** - Missing required fields
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Missing required fields: file, fileName, version"
}
```

**409 Conflict** - Version already exists
```json
{
  "success": false,
  "error": "Conflict",
  "message": "Version 1.0.0 already exists for file myapp"
}
```



**500 Internal Server Error** - Server error
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "An error occurred while processing your request"
}
```

---

### 4.4 API Authentication

**Method:** Bearer Token Authentication (Database-Backed)

**How It Works:**
1. API keys are stored in the `api_keys` table in Supabase
2. Each key has a unique name (e.g., "github-actions", "gitlab-ci") 
3. When an upload request arrives, the system validates the key against the database
4. The `last_used_at` timestamp is updated on successful validation
5. Inactive keys (`is_active = FALSE`) are automatically rejected

**Environment Variables:**
```bash
# .env
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # For server-side operations
```

**Implementation:**
```javascript
// In SvelteKit API route: /src/routes/api/upload/+server.js
import { createClient } from '@supabase/supabase-js';

export async function POST({ request }) {
    // Extract the Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header'
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    const providedKey = authHeader.replace('Bearer ', '');
    
    // Initialize Supabase client with service role key
    const supabase = createClient(
        process.env.PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Validate API key against database
    const { data: apiKey, error } = await supabase
        .from('api_keys')
        .select('id, key_name, is_active')
        .eq('key_value', providedKey)
        .eq('is_active', true)
        .single();
    
    if (error || !apiKey) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Unauthorized',
                message: 'Invalid or inactive API key'
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
    }
    
    // Update last_used_at timestamp
    await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', apiKey.id);
    
    // Store the key name for tracking who uploaded
    const uploaderName = apiKey.key_name;
    
    // Continue with upload logic...
    // When creating version record, include: uploaded_by: uploaderName
}
```

**API Key Generation:**

You can generate API keys using a SQL query or a simple script:

```sql
-- Generate a new API key
INSERT INTO api_keys (key_name, key_value)
VALUES (
    'github-actions-main',
    encode(gen_random_bytes(32), 'base64')
);

-- View all API keys
SELECT 
    key_name,
    key_value,
    created_at,
    last_used_at,
    is_active
FROM api_keys
ORDER BY created_at DESC;

-- Revoke an API key (soft delete)
UPDATE api_keys
SET is_active = FALSE
WHERE key_name = 'old-pipeline';

-- Reactivate an API key
UPDATE api_keys
SET is_active = TRUE
WHERE key_name = 'github-actions-main';
```

**JavaScript/Node.js Key Generator:**
```javascript
// generate-api-key.js
import crypto from 'crypto';

function generateApiKey() {
    return crypto.randomBytes(32).toString('base64');
}

console.log('New API Key:', generateApiKey());
```

**Security Recommendations:**
1. Generate cryptographically secure random keys (32+ bytes)
2. Never expose the `api_keys` table via public API
3. Use service role key only in server-side code
4. Rotate keys periodically (every 90-180 days)
5. Revoke keys immediately if compromised
6. Monitor `last_used_at` for suspicious activity
7. Use HTTPS only to prevent key interception
8. Store keys securely in CI/CD secrets (GitHub Secrets, GitLab Variables, etc.)

**Key Management Workflow:**

1. **Creating a new key:**
   ```sql
   INSERT INTO api_keys (key_name, key_value)
   VALUES ('new-pipeline', encode(gen_random_bytes(32), 'base64'));
   ```

2. **Distributing the key:**
   - Copy the `key_value` from the database
   - Add to CI/CD secrets
   - Never commit to version control

3. **Revoking a key:**
   ```sql
   UPDATE api_keys SET is_active = FALSE WHERE key_name = 'old-pipeline';
   ```

4. **Monitoring usage:**
   ```sql
   SELECT key_name, last_used_at 
   FROM api_keys 
   WHERE is_active = TRUE
   ORDER BY last_used_at DESC;
   ```

---

### 4.5 File Upload Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Upload Request Flow                       │
└─────────────────────────────────────────────────────────────┘

1. Receive POST /api/upload
   │
   ├─► Extract Bearer Token from Authorization Header
   │   └─► If missing: Return 401
   │
   ├─► Validate API Key Against Database
   │   ├─► Query: SELECT FROM api_keys WHERE key_value = ? AND is_active = TRUE
   │   ├─► If not found: Return 401 (Invalid API key)
   │   ├─► If found: Extract key_name for tracking
   │   └─► Update last_used_at timestamp
   │
   ├─► Validate Request Body
   │   ├─► Check required fields (file, fileName, version)
   │   ├─► Validate fileName format (alphanumeric, dash, underscore)
   │   ├─► Validate version format
   │   ├─► Check file size (max 50MB)
   │   └─► If invalid: Return 400
   │
   ├─► Check for Duplicate Version
   │   ├─► Query: SELECT FROM versions WHERE file_metadata_id = ? AND version = ?
   │   └─► If exists: Return 409 Conflict
   │
   ├─► Get or Create file_metadata Record
   │   ├─► Query: SELECT FROM file_metadata WHERE file_name = ?
   │   └─► If not exists: INSERT INTO file_metadata
   │
   ├─► Create Version Record
   │   ├─► INSERT INTO versions (include uploaded_by = key_name, file_url from client)
   │   ├─► Trigger automatically updates is_latest flag
   │   └─► If fails: Return 500
   │
   └─► Return Success Response (201)
       └─► Include fileUrl, versionId, metadata, uploaded_by
```

---

## 5. SYSTEM CONCEPTS

### 5.1 Core Concepts

#### 5.1.1 File Identity
- Each unique file is identified by its `file_name`
- The `file_name` acts as a logical grouping for all versions
- Example: "myapp" can have versions "1.0.0", "1.0.1", "2.0.0"

#### 5.1.2 Version Management
- Versions are strings, allowing flexibility (semantic versioning, build numbers, dates)
- Each version is unique per file (enforced by database constraint)
- The system automatically tracks the "latest" version using the `is_latest` flag
- Versions are immutable - once uploaded, they cannot be modified

#### 5.1.3 Storage Organization
- Files are hosted externally (CDN, cloud storage, etc.)
- Clients are responsible for uploading files and providing accessible URLs
- The system only stores and manages file metadata and URLs

#### 5.1.4 Public vs Protected Access
- **Public Access:** Anyone can view and download files (read-only)
- **Protected Access:** Only authenticated CI/CD systems can upload (write)
- No user accounts or login UI - simple API key authentication

---

### 5.2 Data Flow Diagrams

#### 5.2.1 User Viewing Files (Public Access)

```
┌──────┐                    ┌─────────────┐                ┌──────────┐
│ User │───── GET / ───────►│  SvelteKit  │───── Query ───►│ Supabase │
└──────┘                    │   Server    │                │ Database │
   ▲                        └─────────────┘                └──────────┘
   │                               │                              │
   │                               ▼                              │
   │                        Fetch file_metadata                   │
   │                        + versions (with                      │
   │                        download URLs)                        │
   │                               │                              │
   │                               ▼                              ▼
   │                        ┌──────────────────────────────────────┐
   └────── HTML page ───────│  Render page with file list          │
                            │  - Group by file_name                │
                            │  - Show versions (latest first)      │
                            │  - Display download buttons          │
                            └──────────────────────────────────────┘
```

---

#### 5.2.2 CI/CD Upload Flow (Protected Access)

```
┌─────────────┐              ┌─────────────┐              ┌──────────┐
│   CI/CD     │── POST ──────►│  SvelteKit  │              │ Supabase │
│  Pipeline   │   /api/upload │   Server    │              │          │
└─────────────┘              └─────────────┘              └──────────┘
      │                             │                            │
      │ Authorization: Bearer KEY   │                            │
      │ file, fileName, version     │                            │
      │                             ▼                            │
      │                      Validate API Key                    │
      │                             │                            │
      │                             ▼                            │
      │                      Validate input                      │
      │                             │                            │
      │                             ▼                            │
      │                      Check duplicate ────────Query──────►│
      │                             │◄────────Result─────────────│
      │                             ▼                            │
      │                      Get/Create                          │
      │                      file_metadata ──────Query──────────►│
      │                             │◄────────Result─────────────│
      │                             ▼                            │
      │                      Upload to Storage                   │
      │                             │──────Upload────────────────►│
      │                             │◄────Success────────────────│
      │                             ▼                            │
      │                      Insert version record               │
      │                             │──────Insert────────────────►│
      │                             │◄────Success────────────────│
      │                             │     (Trigger updates        │
      │                             │      is_latest flag)        │
      │                             ▼                            │
      │◄──── 201 Created ───── Return success                    │
      │      (with download URL)    │                            │
      ▼                             │                            │
   Success!                         │                            │
```

---

### 5.3 Security Model

#### 5.3.1 Threat Model

**Threats Considered:**
1. Unauthorized file uploads (prevented by API key)
2. Accidental file deletion (no delete functionality)
3. Data exposure (public read is intentional)
4. API abuse (rate limiting recommended)
5. Storage exhaustion (file size limits)

**Threats NOT Considered (Out of Scope):**
1. Private/sensitive files (all files are public)
2. User authentication/authorization for downloads
3. File content scanning/validation
4. Version rollback or deletion

#### 5.3.2 Security Controls

| Control | Implementation | Purpose |
|---------|---------------|---------|
| API Key Authentication | Bearer token in Authorization header | Prevent unauthorized uploads |
| HTTPS Only | Enforce SSL/TLS | Protect API key in transit |
| File Size Limits | Max 100MB per file | Prevent storage exhaustion |
| Version Uniqueness | Database constraint | Prevent accidental overwrites |
| RLS Policies | Supabase RLS | Control database access |
| Input Validation | Server-side checks | Prevent injection attacks |
| CORS Configuration | Restrict origins | Prevent unauthorized API calls |

---

### 5.4 Scalability Considerations

#### 5.4.1 Current Architecture Limits
- **Database:** Supabase PostgreSQL can handle millions of records
- **Storage:** Supabase Storage has generous limits (depends on plan)
- **Concurrent Uploads:** Limited by SvelteKit server capacity
- **Download Speed:** Limited by Supabase Storage CDN

#### 5.4.2 Growth Strategies

**Short-term (0-1000 files):**
- Current architecture is sufficient
- No special optimizations needed

**Medium-term (1000-10000 files):**
- Add pagination to homepage
- Implement search/filter functionality
- Consider caching frequently accessed metadata

**Long-term (10000+ files):**
- Implement cleanup policies (delete old versions)
- Add separate "archive" storage tier
- Consider CDN for popular downloads
- Implement background job processing for uploads

---

### 5.5 Monitoring & Observability

#### 5.5.1 Key Metrics to Track

**Upload Metrics:**
- Total uploads per day/week/month
- Failed upload attempts
- Average upload duration
- Storage space used
- File size distribution

**Download Metrics:**
- Download count per file/version
- Popular files (most downloaded)
- Download bandwidth usage

**System Health:**
- API response times
- Database query performance
- Error rates (4xx, 5xx responses)

#### 5.5.2 Logging Strategy

**Upload Logs:**
```json
{
  "timestamp": "2025-12-16T10:30:00Z",
  "action": "upload",
  "fileName": "myapp",
  "version": "1.0.0",
  "fileSize": 2048576,
  "status": "success",
  "duration_ms": 1234,
  "ip": "192.168.1.1"
}
```

**Error Logs:**
```json
{
  "timestamp": "2025-12-16T10:30:00Z",
  "action": "upload",
  "fileName": "myapp",
  "version": "1.0.0",
  "status": "error",
  "errorCode": "DUPLICATE_VERSION",
  "errorMessage": "Version already exists",
  "ip": "192.168.1.1"
}
```

---

### 5.6 Deployment Architecture

#### 5.6.1 Recommended Deployment

```
┌──────────────────────────────────────────────────────────┐
│                    Deployment Stack                       │
└──────────────────────────────────────────────────────────┘

┌──────────────┐         ┌─────────────────┐         ┌────────────┐
│   Vercel/    │────────►│   SvelteKit     │◄────────│  Supabase  │
│   Netlify    │         │   Application   │         │  (Hosted)  │
│              │         │                 │         │            │
│ - CDN        │         │ - SSR Pages     │         │ - Database │
│ - SSL        │         │ - API Routes    │         │ - Storage  │
│ - Edge       │         │ - Static Assets │         │ - Auth     │
└──────────────┘         └─────────────────┘         └────────────┘
       ▲                         ▲                          ▲
       │                         │                          │
       │                         │                          │
   Users (GET /)           CI/CD (POST)              Direct download
                         (GitHub Actions)              (Public URL)
```

#### 5.6.2 Environment Variables

```bash
# .env.local (Development)
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... # For public read access
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # For server-side operations (uploads, API key validation)
MEGA_EMAIL=your-mega-email@example.com # For large-file storage via MEGA
MEGA_PASSWORD=your-mega-password       # For large-file storage via MEGA

# Production (Set in hosting platform like Vercel/Netlify)
# Same variables, but with production values
```

**Important Notes:**
- **API keys are now stored in the database** (in the `api_keys` table), not in environment variables
- `SUPABASE_SERVICE_ROLE_KEY` is used by the SvelteKit API to:
  - Query the `api_keys` table for validation
  - Insert records into `file_metadata` and `versions` tables
  - Upload files to Supabase Storage
- Individual CI/CD pipelines use their own unique API keys from the `api_keys` table

---

### 5.7 API Usage Examples

#### 5.7.1 CI/CD Integration - GitHub Actions

```yaml
# .github/workflows/release.yml
name: Upload Release

on:
  release:
    types: [published]

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Build application
        run: |
          npm install
          npm run build
          zip -r myapp-${{ github.event.release.tag_name }}.zip dist/
      
      - name: Upload to CDN/Storage
        id: upload
        run: |
          # Upload to your CDN or storage provider
          # This example assumes you get back a URL
          FILE_URL=$(upload-to-cdn myapp-${{ github.event.release.tag_name }}.zip)
          echo "file_url=$FILE_URL" >> $GITHUB_OUTPUT
          echo "file_size=$(stat -f%z myapp-${{ github.event.release.tag_name }}.zip)" >> $GITHUB_OUTPUT
      
      - name: Register with Versioning System
        run: |
          curl -X POST https://your-domain.com/api/upload \
            -H "Authorization: Bearer ${{ secrets.UPLOAD_API_KEY }}" \
            -F "fileName=myapp" \
            -F "version=${{ github.event.release.tag_name }}" \
            -F "fileUrl=${{ steps.upload.outputs.file_url }}" \
            -F "fileSize=${{ steps.upload.outputs.file_size }}" \
            -F "fileType=application/zip" \
            -F 'metadata={"commit":"${{ github.sha }}","branch":"main"}'
```

#### 5.7.2 Manual Upload - cURL

```bash
# First, upload your file to your CDN/storage provider
# Then register it with the versioning system
curl -X POST https://your-domain.com/api/upload \
  -H "Authorization: Bearer your-api-key-here" \
  -F "fileName=myapp" \
  -F "version=1.0.0" \
  -F "fileUrl=https://cdn.example.com/myapp-v1.0.0.zip" \
  -F "fileSize=2048576" \
  -F "fileType=application/zip" \
  -F 'metadata={"buildNumber":"123","commitHash":"abc123"}'
```

#### 5.7.3 Manual Upload - Python Script

```python
import requests
import json

def upload_file(file_path, file_name, version, api_key, metadata=None):
    url = "https://your-domain.com/api/upload"
    
    headers = {
        "Authorization": f"Bearer {api_key}"
    }
    
    files = {
        "file": open(file_path, "rb")
    }
    
    data = {
        "fileName": file_name,
        "version": version
    }
    
    if metadata:
        data["metadata"] = json.dumps(metadata)
    
    response = requests.post(url, headers=headers, files=files, data=data)
    
    if response.status_code == 201:
        print("✅ Upload successful!")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"❌ Upload failed: {response.status_code}")
        print(response.text)

# Usage
upload_file(
    file_path="./build/myapp-v1.0.0.zip",
    file_name="myapp",
    version="1.0.0",
    api_key="your-api-key-here",
    metadata={
        "commit": "abc123",
        "buildNumber": 456
    }
)
```

---

## 6. API KEY MANAGEMENT

### 6.1 Overview

API keys are stored in the `api_keys` database table and are used to authenticate upload requests from CI/CD pipelines. This approach provides better security, traceability, and management compared to hardcoded environment variables.

### 6.2 Creating API Keys

#### Method 1: SQL Query (Direct Database Access)

```sql
-- Generate a new API key with a secure random value
INSERT INTO api_keys (key_name, key_value)
VALUES (
    'github-actions-main',
    encode(gen_random_bytes(32), 'base64')
)
RETURNING key_name, key_value;

-- Example output:
-- key_name: github-actions-main
-- key_value: 8xJK2mP9vN3qR7sT1wU4yZ6bC8dE0fG2hI4jK6lM8nO=
```

#### Method 2: Node.js Script

```javascript
// scripts/create-api-key.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createApiKey(keyName) {
    // Generate a cryptographically secure random key
    const keyValue = crypto.randomBytes(32).toString('base64');
    
    const { data, error } = await supabase
        .from('api_keys')
        .insert({
            key_name: keyName,
            key_value: keyValue
        })
        .select()
        .single();
    
    if (error) {
        console.error('Error creating API key:', error);
        return;
    }
    
    console.log('✅ API Key created successfully!');
    console.log('Key Name:', data.key_name);
    console.log('Key Value:', data.key_value);
    console.log('');
    console.log('⚠️  IMPORTANT: Save this key securely!');
    console.log('Add it to your CI/CD secrets as UPLOAD_API_KEY');
}

// Usage: node scripts/create-api-key.js github-actions-main
const keyName = process.argv[2] || 'default-key';
createApiKey(keyName);
```

#### Method 3: Supabase SQL Editor

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Run the following query:

```sql
INSERT INTO api_keys (key_name, key_value)
VALUES (
    'your-pipeline-name',
    encode(gen_random_bytes(32), 'base64')
)
RETURNING *;
```

4. Copy the generated `key_value`
5. Save it securely in your CI/CD secrets

---

### 6.3 Viewing API Keys

```sql
-- List all API keys with their status
SELECT 
    key_name,
    key_value,
    created_at,
    last_used_at,
    is_active,
    CASE 
        WHEN last_used_at IS NULL THEN 'Never used'
        WHEN last_used_at > NOW() - INTERVAL '7 days' THEN 'Recently used'
        WHEN last_used_at > NOW() - INTERVAL '30 days' THEN 'Used this month'
        ELSE 'Inactive'
    END as usage_status
FROM api_keys
ORDER BY created_at DESC;
```

**Example Output:**
```
key_name              | key_value       | created_at          | last_used_at        | is_active | usage_status
----------------------|-----------------|---------------------|---------------------|-----------|---------------
github-actions-main   | 8xJK2mP9vN3... | 2025-12-01 10:00:00 | 2025-12-16 09:30:00 | true      | Recently used
gitlab-ci-production  | pL9mK8nJ7hG... | 2025-12-05 14:00:00 | 2025-12-10 11:00:00 | true      | Used this month
jenkins-old           | qR8sT7uV6wX... | 2025-11-01 08:00:00 | 2025-11-15 16:00:00 | false     | Inactive
```

---

### 6.4 Revoking API Keys

#### Soft Delete (Recommended)
Deactivate a key without deleting it (preserves audit trail):

```sql
-- Revoke a specific key
UPDATE api_keys
SET is_active = FALSE
WHERE key_name = 'old-pipeline';

-- Verify revocation
SELECT key_name, is_active FROM api_keys WHERE key_name = 'old-pipeline';
```

#### Hard Delete (Permanent)
Permanently delete a key (not recommended, loses audit trail):

```sql
DELETE FROM api_keys WHERE key_name = 'compromised-key';
```

---

### 6.5 Reactivating API Keys

```sql
-- Reactivate a previously revoked key
UPDATE api_keys
SET is_active = TRUE
WHERE key_name = 'github-actions-main';
```

---

### 6.6 Rotating API Keys

**When to Rotate:**
- Every 90-180 days (regular rotation)
- Immediately if a key is compromised
- When a team member with key access leaves
- After a security incident

**Rotation Process:**

1. **Create a new key:**
```sql
INSERT INTO api_keys (key_name, key_value)
VALUES (
    'github-actions-main-v2',
    encode(gen_random_bytes(32), 'base64')
)
RETURNING key_value;
```

2. **Update CI/CD secrets with the new key**

3. **Test the new key:**
```bash
curl -X POST https://your-domain.com/api/upload \
  -H "Authorization: Bearer NEW_KEY_HERE" \
  -F "file=@test.zip" \
  -F "fileName=test" \
  -F "version=1.0.0"
```

4. **Revoke the old key:**
```sql
UPDATE api_keys
SET is_active = FALSE
WHERE key_name = 'github-actions-main-v1';
```

---

### 6.7 Monitoring API Key Usage

#### Check Last Usage
```sql
-- Find keys that haven't been used recently
SELECT 
    key_name,
    last_used_at,
    NOW() - last_used_at as time_since_last_use
FROM api_keys
WHERE is_active = TRUE
ORDER BY last_used_at DESC NULLS LAST;
```

#### Track Upload Activity by Key
```sql
-- See which keys are being used most
SELECT 
    uploaded_by,
    COUNT(*) as upload_count,
    MAX(uploaded_at) as last_upload,
    SUM(file_size) as total_bytes_uploaded
FROM versions
GROUP BY uploaded_by
ORDER BY upload_count DESC;
```

#### Detect Suspicious Activity
```sql
-- Find API keys with unusual activity
SELECT 
    ak.key_name,
    ak.last_used_at,
    COUNT(v.id) as recent_uploads
FROM api_keys ak
LEFT JOIN versions v ON v.uploaded_by = ak.key_name 
    AND v.uploaded_at > NOW() - INTERVAL '1 hour'
WHERE ak.is_active = TRUE
GROUP BY ak.key_name, ak.last_used_at
HAVING COUNT(v.id) > 10; -- Alert if more than 10 uploads in an hour
```

---

### 6.8 Security Best Practices

1. **Key Generation:**
   - Always use cryptographically secure random generation
   - Minimum 32 bytes (256 bits) of entropy
   - Use base64 encoding for compatibility

2. **Key Storage:**
   - Never commit keys to version control
   - Store in CI/CD secrets (GitHub Secrets, GitLab CI/CD Variables)
   - Use separate keys for different environments (dev, staging, prod)

3. **Key Distribution:**
   - Share keys only through secure channels (1Password, password managers)
   - Rotate keys immediately if shared insecurely
   - Document which team members have access to which keys

4. **Key Naming:**
   - Use descriptive names: `{service}-{environment}-{purpose}`
   - Examples: `github-actions-production`, `gitlab-ci-staging`

5. **Monitoring:**
   - Set up alerts for unused keys (>30 days)
   - Monitor for excessive usage patterns
   - Review key activity monthly

6. **Revocation:**
   - Use soft delete (is_active = FALSE) to preserve audit trail
   - Immediately revoke compromised keys
   - Clean up old, unused keys quarterly

---

### 6.9 CI/CD Integration Examples

#### GitHub Actions
```yaml
# .github/workflows/upload.yml
name: Upload Release

on:
  release:
    types: [published]

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Upload to File System
        env:
          API_KEY: ${{ secrets.UPLOAD_API_KEY }}
        run: |
          curl -X POST https://your-domain.com/api/upload \
            -H "Authorization: Bearer $API_KEY" \
            -F "file=@build/app.zip" \
            -F "fileName=myapp" \
            -F "version=${{ github.event.release.tag_name }}"
```

**Setting the secret:**
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `UPLOAD_API_KEY`
4. Value: (paste the API key from database)

---

#### GitLab CI
```yaml
# .gitlab-ci.yml
upload:
  stage: deploy
  script:
    - |
      curl -X POST https://your-domain.com/api/upload \
        -H "Authorization: Bearer $UPLOAD_API_KEY" \
        -F "file=@build/app.zip" \
        -F "fileName=myapp" \
        -F "version=$CI_COMMIT_TAG"
  only:
    - tags
```

**Setting the variable:**
1. Go to Settings → CI/CD → Variables
2. Click "Add variable"
3. Key: `UPLOAD_API_KEY`
4. Value: (paste the API key from database)
5. Check "Protect variable" and "Mask variable"

---

#### Jenkins
```groovy
pipeline {
    agent any
    environment {
        API_KEY = credentials('upload-api-key')
    }
    stages {
        stage('Upload') {
            steps {
                sh '''
                    curl -X POST https://your-domain.com/api/upload \
                      -H "Authorization: Bearer $API_KEY" \
                      -F "file=@build/app.zip" \
                      -F "fileName=myapp" \
                      -F "version=${BUILD_NUMBER}"
                '''
            }
        }
    }
}
```

**Setting the credential:**
1. Go to Manage Jenkins → Manage Credentials
2. Add Credentials → Secret text
3. ID: `upload-api-key`
4. Secret: (paste the API key from database)

---

### 6.10 Troubleshooting

#### Problem: "Invalid or inactive API key"
**Solution:**
```sql
-- Check if key exists and is active
SELECT key_name, is_active FROM api_keys WHERE key_value = 'YOUR_KEY_HERE';

-- If inactive, reactivate it
UPDATE api_keys SET is_active = TRUE WHERE key_value = 'YOUR_KEY_HERE';
```

#### Problem: Key not working after creation
**Solution:**
- Ensure you copied the full key value (base64 can be long)
- Check for extra spaces or newlines
- Verify the Bearer token format: `Authorization: Bearer YOUR_KEY`

#### Problem: Need to find which key a specific upload used
**Solution:**
```sql
-- Find uploads by a specific key
SELECT 
    v.file_name,
    v.version,
    v.uploaded_at,
    v.uploaded_by
FROM versions v
JOIN file_metadata fm ON v.file_metadata_id = fm.id
WHERE v.uploaded_by = 'github-actions-main'
ORDER BY v.uploaded_at DESC;
```

---

## 7. FUTURE ENHANCEMENTS (Out of Current Scope)

### 7.1 Potential Features
- **Search & Filter:** Search by file name or filter by version
- **Download Statistics:** Track download counts and popular files
- **Cleanup Policies:** Automatic deletion of old versions (keep last N)
- **Release Notes:** Display release notes per version
- **Webhooks:** Notify external systems on new uploads
- **API Key Management:** Web UI for generating/revoking API keys
- **Multi-file Uploads:** Upload multiple files in one request
- **File Validation:** Scan for malware, validate file types
- **Private Files:** Support for authenticated downloads

### 7.2 Alternative Architectures
- **Serverless Functions:** AWS Lambda + S3 + DynamoDB
- **Object Storage:** MinIO for self-hosted storage
- **CDN Integration:** CloudFlare for faster global downloads

---

## 8. DEVELOPMENT CHECKLIST

### 8.1 Phase 1: Setup (Week 1)
- [ ] Create Supabase project
- [ ] Set up database schema (tables, indexes, triggers)
  - [ ] Create `api_keys` table
  - [ ] Create `file_metadata` table
  - [ ] Create `versions` table
  - [ ] Add indexes for performance
  - [ ] Create trigger for `is_latest` flag
- [ ] Configure RLS policies
  - [ ] Enable RLS on all tables
  - [ ] Set up policies for `api_keys` (service role only)
  - [ ] Set up policies for `file_metadata` (public read, service write)
  - [ ] Set up policies for `versions` (public read, service write)
- [ ] Create storage bucket
- [ ] Generate initial API keys
  - [ ] Create key for GitHub Actions
  - [ ] Create key for other CI/CD pipelines
  - [ ] Document key names and purposes
- [ ] Initialize SvelteKit project
- [ ] Set up environment variables
  - [ ] `PUBLIC_SUPABASE_URL`
  - [ ] `PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`

### 8.2 Phase 2: API Development (Week 1-2)
- [ ] Implement `/api/upload` endpoint
- [ ] Add database-backed API key authentication
  - [ ] Query `api_keys` table for validation
  - [ ] Update `last_used_at` timestamp
  - [ ] Handle inactive keys
- [ ] Implement file upload to Supabase Storage
- [ ] Add database record creation
  - [ ] Create/update `file_metadata`
  - [ ] Insert `versions` record with `uploaded_by`
- [ ] Implement error handling
- [ ] Add input validation
- [ ] Test upload flow with multiple API keys

### 8.3 Phase 3: Frontend Development (Week 2)
- [ ] Create home page layout
- [ ] Fetch and display file metadata
- [ ] Generate download links
- [ ] Add "latest" version badge
- [ ] Display uploader information (uploaded_by)
- [ ] Style responsive UI
- [ ] Test download functionality

### 8.4 Phase 4: Testing & Deployment (Week 3)
- [ ] Write unit tests for API
- [ ] Test API key validation
  - [ ] Valid key
  - [ ] Invalid key
  - [ ] Inactive key
  - [ ] Missing key
- [ ] Test CI/CD integration
  - [ ] GitHub Actions
  - [ ] GitLab CI
  - [ ] Other pipelines
- [ ] Load testing (simulate multiple uploads)
- [ ] Security audit
  - [ ] RLS policy verification
  - [ ] API key exposure check
  - [ ] HTTPS enforcement
- [ ] Deploy to production
- [ ] Set up API key rotation schedule
- [ ] Monitor logs and metrics

---

## 9. GLOSSARY

| Term | Definition |
|------|------------|
| **API Key** | Unique token stored in database for authenticating CI/CD upload requests |
| **File Metadata** | Parent record representing a unique file by name |
| **Version** | Specific iteration of a file with version identifier |
| **Storage Path** | Supabase storage key or full external URL (e.g. MEGA link) |
| **Latest Version** | Most recently uploaded version of a file |
| **RLS** | Row Level Security - Supabase feature for access control |
| **Service Role Key** | Supabase admin key for server-side operations (bypasses RLS) |
| **CI/CD** | Continuous Integration/Continuous Deployment pipeline |
| **Semantic Versioning** | Version format: MAJOR.MINOR.PATCH (e.g., 1.0.0) |
| **Soft Delete** | Deactivating a record (is_active = FALSE) without removing it |
| **Hard Delete** | Permanently removing a record from the database |
| **Key Rotation** | Process of replacing an API key with a new one |
| **uploaded_by** | Field tracking which API key was used for an upload |

---

## 10. REFERENCES & RESOURCES

### 10.1 Documentation
- **SvelteKit:** https://kit.svelte.dev/docs
- **Supabase:** https://supabase.com/docs
- **Supabase Storage:** https://supabase.com/docs/guides/storage
- **PostgreSQL:** https://www.postgresql.org/docs/

### 10.2 API Standards
- **REST API Best Practices:** https://restfulapi.net/
- **HTTP Status Codes:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- **Semantic Versioning:** https://semver.org/

---

**Document End**

---

## APPENDIX A: Sample Data

### Sample api_keys Records
```sql
INSERT INTO api_keys (id, key_name, key_value, created_at, last_used_at, is_active) VALUES
('a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6', 'github-actions-main', '8xJK2mP9vN3qR7sT1wU4yZ6bC8dE0fG2hI4jK6lM8nO=', '2025-12-01 09:00:00', '2025-12-16 10:00:00', true),
('b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7', 'gitlab-ci-production', 'pL9mK8nJ7hG6fE5dC4bA3zY2xW1vU0tS9rQ8pO7nM6L=', '2025-12-05 14:00:00', '2025-12-15 16:30:00', true),
('c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8', 'jenkins-old', 'qR8sT7uV6wX5yZ4aB3cD2eF1gH0iJ9kL8mN7oP6qR5s=', '2025-11-01 08:00:00', '2025-11-20 12:00:00', false);
```

### Sample file_metadata Records
```sql
INSERT INTO file_metadata (id, file_name, created_at, updated_at) VALUES
('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'myapp', '2025-12-01 10:00:00', '2025-12-16 10:00:00'),
('550e8400-e29b-41d4-a716-446655440000', 'tool-installer', '2025-12-05 14:30:00', '2025-12-15 09:00:00');
```

### Sample versions Records
```sql
INSERT INTO versions (id, file_metadata_id, version, storage_path, file_size, file_type, uploaded_at, is_latest, uploaded_by) VALUES
('123e4567-e89b-12d3-a456-426614174000', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', '1.0.0', 'files/myapp/1.0.0/myapp-v1.0.0.zip', 2048576, 'application/zip', '2025-12-01 10:00:00', false, 'github-actions-main'),
('223e4567-e89b-12d3-a456-426614174001', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', '2.0.1', 'files/myapp/2.0.1/myapp-v2.0.1.zip', 3145728, 'application/zip', '2025-12-16 10:00:00', true, 'github-actions-main'),
('323e4567-e89b-12d3-a456-426614174002', '550e8400-e29b-41d4-a716-446655440000', '1.5.0', 'files/tool-installer/1.5.0/installer.exe', 5242880, 'application/x-msdownload', '2025-12-15 09:00:00', true, 'gitlab-ci-production');
```

---

## APPENDIX B: Troubleshooting Guide

### Common Issues

#### Issue: 401 Unauthorized on Upload
**Cause:** Invalid or missing API key
**Solution:** 
1. Verify API key exists in database: `SELECT * FROM api_keys WHERE key_value = 'YOUR_KEY'`
2. Check if key is active: `is_active = TRUE`
3. Verify Authorization header format: `Bearer YOUR_KEY`
4. Ensure no extra spaces or newlines in the key
5. Check that key was copied correctly (base64 strings can be long)

#### Issue: 409 Conflict - Version Already Exists
**Cause:** Attempting to upload duplicate version
**Solution:**
1. Check if version already exists in database
2. Use a different version identifier
3. If reupload is needed, contact admin to delete old version

#### Issue: 413 Payload Too Large
**Cause:** File exceeds size limit
**Solution:**
1. Check file size (max 100MB recommended)
2. Compress file if possible
3. Contact admin to increase limit if necessary

#### Issue: Downloads Not Working
**Cause:** Storage bucket permissions or RLS policy
**Solution:**
1. Verify storage bucket is set to public
2. Check RLS policies allow public read
3. Test direct Supabase Storage URL

---

**End of System Design Document**