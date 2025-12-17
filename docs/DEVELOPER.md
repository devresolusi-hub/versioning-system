# DEVELOPER GUIDE

This document explains how to set up, run, and extend the File Versioning System built with **SvelteKit** and **Supabase**.

---

## 1. Architecture Overview

- **Frontend / Backend**: SvelteKit (SSR + API routes)
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage (public bucket `files`)
- **Auth**: DB-backed API keys in `api_keys` table

Key flows:

- **Upload**: CI/CD → `POST /api/upload` → validate API key → upload file to Storage → create DB records.
- **Browse**: User → `GET /` → SvelteKit fetches file/version data from Supabase → renders list with download links.

See `SDD.md` for full design details.

---

## 2. Local Setup

### 2.1 Prerequisites

- Node.js 20+
- `pnpm`: `npm install -g pnpm`
- Supabase project with:
  - Database (Postgres)
  - Storage bucket `files` (public)

### 2.2 Install dependencies

```bash
pnpm install
```

### 2.3 Environment variables

1. Copy the example file:

   ```bash
   cp .env.example .env
   ```

2. Fill in values:

   - `PUBLIC_SUPABASE_URL` – your Supabase project URL (`https://xxxxx.supabase.co`)
   - `PUBLIC_SUPABASE_ANON_KEY` – anon/public key (from Supabase → Settings → API)
   - `SUPABASE_SERVICE_ROLE_KEY` – **service role key** (server-side only; never expose to clients)
   - `DATABASE_URL` – Postgres connection string (from Supabase)

`.env` is git-ignored; only `.env.example` is committed.

### 2.4 Database migrations & seeders

```bash
# run all migrations in supabase/migrations/
pnpm migrate

# run seeders in supabase/seeders/ (sample API keys)
pnpm seed
```

Migrations create:

- `api_keys` – API key storage.
- `file_metadata` – one row per logical file.
- `versions` – one row per version of a file.
- Trigger function to maintain `is_latest` and `file_metadata.updated_at`.
- RLS policies (public read for files/versions; service-only for `api_keys`).

Seeders create sample API keys for testing.

### 2.5 Run the app

```bash
pnpm dev
```

Visit `http://localhost:5173`.

---

## 3. Project Structure

High-level layout:

- `src/routes/+page.server.ts` – server load for home page (fetches files/versions).
- `src/routes/+page.svelte` – UI for listing files and versions with download links.
- `src/routes/api/upload/+server.ts` – upload API endpoint.
- `supabase/migrations/` – SQL migrations (schema, triggers, RLS).
- `supabase/seeders/` – SQL seeders (sample API keys).
- `scripts/migration.mjs` – helper to run migrations with `DATABASE_URL`.
- `scripts/seeder.mjs` – helper to run seeders with `DATABASE_URL`.
- `todo/` – high-level TODOs for project phases.
- `temp/` – implementation logs (what was done, issues, outcomes).

---

## 4. `/api/upload` Endpoint (Server)

File: `src/routes/api/upload/+server.ts`

Responsibilities:

- **Auth**
  - Reads `Authorization: Bearer <API_KEY>` header.
  - Uses Supabase service-role client (`PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  - Validates API key in `api_keys` table (`key_value`, `is_active = TRUE`).
  - Updates `last_used_at` on success.
- **Input**
  - Content-Type: `multipart/form-data`.
  - Required fields:
    - `file` – binary file.
    - `fileName` – `[A-Za-z0-9_-]+`.
    - `version` – `[A-Za-z0-9._-]+`.
  - Optional:
    - `metadata` – JSON string, must parse to an object.
  - Enforces file size ≤ 100 MB.
- **DB & Storage**
  - Gets or creates `file_metadata` row by `file_name`.
  - Checks `versions` for duplicate `(file_metadata_id, version)` → 409 Conflict.
  - Uploads to Supabase Storage:
    - Bucket: `files`
    - Object path: `{fileName}/{version}/{originalFilename}`
    - `storage_path` column: `files/{fileName}/{version}/{originalFilename}`
  - Inserts into `versions` with metadata and `uploaded_by` (API key name).
  - Trigger ensures `is_latest` is correct.
- **Response**
  - 201 success with:
    - `fileMetadataId`, `versionId`, `fileName`, `version`,
      `storagePath`, `fileSize`, `fileType`, `downloadUrl`,
      `uploadedAt`, `uploadedBy`.
  - Proper JSON errors for 400/401/409/413/500 (see `SDD.md`).

---

## 5. Home Page (`GET /`)

Files:

- `src/routes/+page.server.ts`
- `src/routes/+page.svelte`

Behavior:

- Uses Supabase **anon** client for public read:
  - Fetches `file_metadata` with nested `versions`.
  - Orders by `updated_at DESC`.
  - Sorts versions by `uploaded_at DESC`.
- Renders:
  - One card per file with basic metadata.
  - All versions with:
    - Version number, size, MIME type, upload time.
    - “Latest” badge where `is_latest = TRUE`.
    - Download button using Supabase public URL.
- States:
  - Normal (list), error (loadError), and empty (no files).

---

## 6. Development Workflow

Common commands:

```bash
# dev server
pnpm dev

# type + SvelteKit checks
pnpm check

# ESLint
pnpm lint

# migrations / seeders
pnpm migrate
pnpm seed
```

Before committing:

1. Ensure `pnpm lint` passes.
2. Ensure `pnpm check` passes.

---

## 7. Extending the System

Ideas (also see `SDD.md` “Future Enhancements”):

- Search/filter on the home page.
- Download statistics and analytics.
- Cleanup policies (keep only last N versions).
- Webhooks on new uploads.
- UI for API key management.

When adding new features:

- Update or add SQL migrations (never edit applied migrations; create new numbered files).
- Document behavior in `temp/*_implementation_*.md`.
- Extend `docs/DEVELOPER.md` and/or `docs/INTEGRATION.md` as needed.


