# 003 – Supabase Setup (Migrations & Seeders)

## Tasks
- [ ] Create Supabase project
  - [ ] Sign up/login to Supabase
  - [ ] Create new project
  - [ ] Note down project URL and API keys
- [ ] Set up local migration structure
  - [ ] Create `supabase/migrations/` directory
  - [ ] Verify `scripts/migration.mjs` exists (already present)
- [ ] Create migration files based on SDD schema:
  - [ ] `001_create_api_keys_table.sql`
    - [ ] Create `api_keys` table with columns: id, key_name, key_value, created_at, last_used_at, is_active
    - [ ] Add unique constraints on key_name and key_value
    - [ ] Create indexes: `idx_api_keys_key_value`, `idx_api_keys_is_active`
  - [ ] `002_create_file_metadata_table.sql`
    - [ ] Create `file_metadata` table with columns: id, file_name, created_at, updated_at
    - [ ] Add unique constraint on file_name
    - [ ] Create index: `idx_file_metadata_name`
  - [ ] `003_create_versions_table.sql`
    - [ ] Create `versions` table with all columns from SDD
    - [ ] Add foreign key to file_metadata
    - [ ] Add unique constraint on (file_metadata_id, version)
    - [ ] Create indexes: `idx_versions_file_metadata`, `idx_versions_latest`, `idx_versions_uploaded`, `idx_versions_uploaded_by`
  - [ ] `004_create_update_latest_version_function.sql`
    - [ ] Create `update_latest_version()` function
    - [ ] Create trigger `trigger_update_latest_version` on versions table
  - [ ] `005_enable_rls_and_policies.sql`
    - [ ] Enable RLS on all tables
    - [ ] Create policies for `api_keys` (authenticated only)
    - [ ] Create policies for `file_metadata` (public read, authenticated insert)
    - [ ] Create policies for `versions` (public read, authenticated insert)
- [ ] Set up seeder structure
  - [ ] Create `supabase/seeders/` directory
  - [ ] Verify `scripts/seeder.mjs` exists (already present)
- [ ] Create seeder files:
  - [ ] `001_seed_api_keys.sql` (or `.mjs`)
    - [ ] Insert sample API keys for testing
    - [ ] Example: github-actions-main, gitlab-ci-production
- [ ] Configure environment variables
  - [ ] Create `.env` file with `DATABASE_URL` (Supabase connection string)
  - [ ] Add `.env` to `.gitignore`
  - [ ] Create `.env.example` with placeholder values
- [ ] Run migrations
  - [ ] Test migration script: `node scripts/migration.mjs`
  - [ ] Verify all tables created successfully
- [ ] Run seeders
  - [ ] Test seeder script: `node scripts/seeder.mjs`
  - [ ] Verify sample data inserted

## Commands to Run
```bash
# Run all migrations
node scripts/migration.mjs

# Run fresh migration (drops and recreates)
node scripts/migration.mjs --fresh

# Run all seeders
node scripts/seeder.mjs

# Run specific seeder by prefix
node scripts/seeder.mjs 001
```

## Expected Outcome
- All database tables created with proper schema
- Indexes and constraints in place
- RLS policies configured
- Trigger function working correctly
- Sample API keys seeded for testing
- Storage bucket `files` created (public) in Supabase dashboard

