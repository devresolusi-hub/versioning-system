# 001 – Project Setup

## Tasks
- [ ] Initialize SvelteKit project with TypeScript
  - [ ] Run `npm create svelte@latest .` or `pnpm create svelte@latest .`
  - [ ] Select TypeScript, ESLint, Prettier options
- [ ] Set up package manager (pnpm)
  - [ ] Install pnpm if not already installed: `npm install -g pnpm`
  - [ ] Initialize pnpm: `pnpm init` (if needed)
- [ ] Configure `package.json` with required dependencies:
  - [ ] `@supabase/supabase-js` - Supabase client library
  - [ ] `@sveltejs/adapter-vercel` or `@sveltejs/adapter-auto` - Deployment adapter
  - [ ] `dotenv` - Environment variable management
- [ ] Add scripts to `package.json`:
  - [ ] `dev` - Start development server
  - [ ] `build` - Build for production
  - [ ] `preview` - Preview production build
  - [ ] `lint` - Run ESLint
  - [ ] `check` - Type check with TypeScript
- [ ] Install dependencies: `pnpm i`
- [ ] Test development server: `pnpm dev`
- [ ] Verify project structure matches SvelteKit conventions

## Commands to Run
```bash
pnpm i
pnpm dev
```

## Expected Outcome
- SvelteKit project initialized and running
- All dependencies installed
- Development server accessible at `http://localhost:5173` (or configured port)

