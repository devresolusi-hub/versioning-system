# 004 – API Upload Endpoint Implementation

## Tasks
- [ ] Create `/api/upload` route file
  - [ ] Create `src/routes/api/upload/+server.ts` (or `.js`)
- [ ] Implement API key authentication
  - [ ] Extract Bearer token from `Authorization` header
  - [ ] Validate token format (starts with "Bearer ")
  - [ ] Query `api_keys` table using service role client
  - [ ] Check if key exists and `is_active = TRUE`
  - [ ] Return 401 if invalid/missing/inactive
  - [ ] Update `last_used_at` timestamp on successful validation
  - [ ] Store `key_name` for `uploaded_by` field
- [ ] Implement multipart form data parsing
  - [ ] Parse `multipart/form-data` request
  - [ ] Extract required fields: `file`, `fileName`, `version`
  - [ ] Extract optional field: `metadata` (JSON string)
  - [ ] Validate file is present and not empty
  - [ ] Validate fileName format (alphanumeric, dash, underscore)
  - [ ] Validate version format
  - [ ] Validate file size (max 100MB recommended)
  - [ ] Return 400 for missing/invalid fields
- [ ] Implement duplicate version check
  - [ ] Query `versions` table for existing (file_metadata_id, version)
  - [ ] Return 409 Conflict if version already exists
- [ ] Implement file upload to Supabase Storage
  - [ ] Get or create `file_metadata` record
  - [ ] Generate storage path: `files/{fileName}/{version}/{originalFileName}`
  - [ ] Upload file to Supabase Storage bucket using service role client
  - [ ] Set proper content-type
  - [ ] Handle upload errors (return 500)
- [ ] Create database records
  - [ ] Insert/update `file_metadata` record
  - [ ] Insert `versions` record with:
    - [ ] `file_metadata_id`, `version`, `storage_path`
    - [ ] `file_size`, `file_type`, `uploaded_at`
    - [ ] `metadata` (JSONB), `uploaded_by` (key_name)
    - [ ] `is_latest` (will be set by trigger)
- [ ] Generate download URL
  - [ ] Get public URL from Supabase Storage
  - [ ] Format: `https://{project}.supabase.co/storage/v1/object/public/files/{path}`
- [ ] Implement error handling
  - [ ] Try-catch blocks for all async operations
  - [ ] Proper error responses (400, 401, 409, 413, 500)
  - [ ] Structured error messages matching SDD spec
- [ ] Return success response
  - [ ] 201 Created status
  - [ ] JSON response with: success, message, data (fileMetadataId, versionId, fileName, version, storagePath, fileSize, downloadUrl, uploadedAt, uploadedBy)

## Testing Checklist
- [ ] Test with valid API key → should return 201
- [ ] Test with invalid API key → should return 401
- [ ] Test with inactive API key → should return 401
- [ ] Test with missing Authorization header → should return 401
- [ ] Test with missing required fields → should return 400
- [ ] Test with duplicate version → should return 409
- [ ] Test with file too large → should return 413
- [ ] Test file upload to storage → verify file appears in Supabase Storage
- [ ] Test database records → verify file_metadata and versions created
- [ ] Test `is_latest` flag → verify trigger updates correctly
- [ ] Test `last_used_at` update → verify API key timestamp updated

## Expected Outcome
- `/api/upload` endpoint fully functional
- All error cases handled properly
- Files uploaded to Supabase Storage
- Database records created correctly
- Download URLs generated and returned

