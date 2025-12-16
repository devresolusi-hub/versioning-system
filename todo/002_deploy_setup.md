# 002 – Deployment Setup (GitHub + Vercel)

## Tasks
- [ ] Initialize Git repository (if not already done)
  - [ ] `git init`
  - [ ] Create `.gitignore` with appropriate entries (node_modules, .env, .svelte-kit, etc.)
- [ ] Create GitHub repository
  - [ ] Create new repo on GitHub (or use existing)
  - [ ] Add remote: `git remote add origin <repo-url>`
- [ ] Commit and push initial code
  - [ ] `git add .`
  - [ ] `git commit -m "Initial SvelteKit project setup"`
  - [ ] `git push -u origin main` (or master)
- [ ] Set up Vercel deployment
  - [ ] Sign in to Vercel and connect GitHub account
  - [ ] Import the GitHub repository
  - [ ] Configure build settings:
    - [ ] Framework Preset: SvelteKit
    - [ ] Build Command: `pnpm build` (or `npm run build`)
    - [ ] Output Directory: `.svelte-kit` (auto-detected)
  - [ ] Add environment variables in Vercel dashboard:
    - [ ] `PUBLIC_SUPABASE_URL`
    - [ ] `PUBLIC_SUPABASE_ANON_KEY`
    - [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Deploy and verify
  - [ ] Trigger first deployment
  - [ ] Verify deployment URL is accessible
  - [ ] Test that environment variables are properly loaded

## Commands to Run
```bash
git add .
git commit -m "Initial commit"
git push -u origin main
```

## Expected Outcome
- Code pushed to GitHub
- Vercel deployment configured and live
- Environment variables set in Vercel dashboard
- Production URL accessible

