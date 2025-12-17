# File Versioning System (SvelteKit + Supabase + MEGA)

A lightweight file versioning system for CI/CD pipelines:

- **Upload** versioned build artifacts from CI/CD via a protected `POST /api/upload` endpoint (API key auth).
- **Browse & download** files and all their versions from a public web UI at `/`.
- **Store & track** metadata in Supabase PostgreSQL, with:
  - **Supabase Storage** as the backing store for files up to 50MB.
  - **MEGA (via `megajs`)** as the backing store for larger files (up to 100MB).

The full design is described in `docs/SDD.md`.

---

## Tech Stack

- **App**: SvelteKit (SSR + API routes)
- **Database**: Supabase PostgreSQL
- **Storage**:
  - Supabase Storage (public bucket `files`) for objects ≤ 50MB.
  - MEGA Cloud Storage (via `megajs`) for larger objects.
- **Auth**: Database-backed API keys (`api_keys` table)
- **Deployment**: Any SvelteKit host (Vercel recommended)

---

## Quick Start

### 1. Prerequisites

- Node.js 20+
- `pnpm` (recommended): `npm install -g pnpm`
- Supabase account and project

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

1. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Fill in the values from your Supabase project and MEGA account:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (Supabase Postgres connection string)
- `MEGA_EMAIL` (email for the MEGA account used for large-file storage)
- `MEGA_PASSWORD` (password for the MEGA account)

See `docs/DEVELOPER.md` for details.

### 4. Run database migrations & seeders

```bash
# apply all migrations
pnpm migrate

# seed sample API keys
pnpm seed
```

This creates:

- `api_keys`, `file_metadata`, `versions` tables
- trigger for `is_latest`
- RLS policies
- sample API keys for testing

### 5. Start the dev server

```bash
pnpm dev
```

Visit `http://localhost:5173` to see the file listing UI.

---

## Key Features

- **Public Home Page (`GET /`)**
  - Lists all files (`file_metadata`) with their versions.
  - Shows size, MIME type, upload time.
  - Highlights the latest version with a badge.
  - Provides download links that point either to:
    - Supabase public URLs (for files stored in Supabase), or
    - Direct external URLs (e.g. MEGA links) when `storage_path` is a full URL.

- **Upload Endpoint (`POST /api/upload`)**
  - Authenticated with an API key in `Authorization: Bearer <KEY>`.
  - Accepts `multipart/form-data`:
    - `file` (binary, required)
    - `fileName` (string, required; `[A-Za-z0-9_-]+`)
    - `version` (string, required; `[A-Za-z0-9._-]+`)
    - `metadata` (JSON string, optional)
  - Enforces 100MB max file size.
  - For files **≤ 50MB**:
    - Stored in Supabase Storage under `files/{fileName}/{version}/{originalFilename}`.
  - For files **> 50MB**:
    - Stored in MEGA using `megajs`, and the public MEGA link is saved as `storage_path`.
  - Rejects duplicate `(fileName, version)` combinations with `409 Conflict`.
  - Persists all metadata in the `versions` table, including the storage provider.

---

## Scripts

Common `package.json` scripts:

- **`pnpm dev`** – Start the SvelteKit dev server.
- **`pnpm build`** – Build for production.
- **`pnpm preview`** – Preview the production build.
- **`pnpm check`** – Run SvelteKit + TypeScript checks.
- **`pnpm lint`** – Run ESLint.
- **`pnpm migrate`** – Run all SQL migrations in `supabase/migrations/`.
- **`pnpm seed`** – Run seeders in `supabase/seeders/` (sample API keys).

---

## Documentation

- **System Design**: See `docs/SDD.md` for the full system design document.
- **Developer Guide**: See `docs/DEVELOPER.md` for:
  - Local setup, environment, migrations/seeders
  - Code structure, development workflow
  - Notes on `/api/upload` and the home page.
- **CI/CD Integration**: See `docs/INTEGRATION.md` for:
  - How to configure API keys
  - cURL examples for `POST /api/upload`
  - GitHub Actions / other CI examples.

---

## Status

- ✅ Core schema, migrations, and seeders implemented.
- ✅ `/api/upload` endpoint implemented (Supabase Storage + MEGA for large files + Postgres).
- ✅ Home page implemented (lists files and versions with download links).
- 🚧 API key management scripts and full CI templates are being iterated in `docs/INTEGRATION.md`.
