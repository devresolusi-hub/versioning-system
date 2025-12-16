# 006 – Environment Configuration

## Tasks
- [ ] Set up environment variables
  - [ ] Create `.env` file in project root
  - [ ] Add required variables:
    - [ ] `PUBLIC_SUPABASE_URL` - Supabase project URL
    - [ ] `PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
    - [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
    - [ ] `DATABASE_URL` - PostgreSQL connection string (for migrations/seeders)
- [ ] Create `.env.example` file
  - [ ] Document all required environment variables
  - [ ] Add placeholder values
  - [ ] Add brief descriptions/comments
- [ ] Update `.gitignore`
  - [ ] Ensure `.env` is ignored
  - [ ] Ensure `.env.local` is ignored
  - [ ] Keep `.env.example` tracked
- [ ] Create Supabase client utilities
  - [ ] Create `src/lib/supabase/client.ts` (or `.js`)
    - [ ] Export public client using `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`
    - [ ] Use `createClient` from `@supabase/supabase-js`
  - [ ] Create `src/lib/supabase/server.ts` (or `.js`)
    - [ ] Export service role client using `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
    - [ ] Use `createClient` from `@supabase/supabase-js`
    - [ ] Only use in server-side code (API routes, server load functions)
- [ ] Configure SvelteKit environment variable handling
  - [ ] Ensure `PUBLIC_*` variables are accessible in browser
  - [ ] Ensure service role key is only accessible server-side
  - [ ] Test variable access in both client and server contexts
- [ ] Document environment setup
  - [ ] Add README section on environment variables
  - [ ] Document where to get Supabase keys
  - [ ] Document security best practices (never commit service role key)

## Files to Create/Update
- `.env` (local, not committed)
- `.env.example` (committed)
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `.gitignore` (verify)

## Expected Outcome
- All environment variables properly configured
- Supabase clients created and ready to use
- Environment variables accessible where needed
- `.env.example` documents required variables
- Service role key secured (server-side only)

