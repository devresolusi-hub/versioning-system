# System Design Document (SDD) – **Version 2**  
**“Single-Page SvelteKit + Supabase File Browser”**  
(optimised for **zero-admin, 10–50 users, public downloads, CI uploads only**)

---

## 1. PURPOSE delta-v1
- Strip **every** admin surface: no UI for delete, edit, keys, users.  
- **Single** page (`/`) lists APKs; **single** API route (`/api/upload`) accepts CI drops.  
- **GitHub Releases** hosts bytes (private repo) → **no storage cost / no card**.  
- **Supabase** keeps **metadata only** (PG row + RLS).  
- **Vercel free** Edge functions stay **< 4.5 MB / 10 s** because bytes **never** flow through them.  
- Works for **10-50 daily visitors** without rate-limit pain.

---

## 2. HIGH-LEVEL v2 FLOW

```
GitLab-CI  ─►  GitHub Release (private repo, 64 MB APK)
        │         ▲
        │  302    │  direct browser download
        ▼         │
┌──────────────────────┐        metadata only       ┌──────────────┐
│  Vercel SvelteKit    │ ─────── JSON 2 KB ───────► │  Supabase    │
│  1 page  + 1 edge fn │ ◄──────  SELECT  ──────── │  PostgreSQL  │
└──────────────────────┘                            └──────────────┘
        ▲
        │
    User browser
    (10-50/day)
```

---

## 3. COMPONENT CHANGES v1 → v2

| v1 Item               | v2 Change |
|-----------------------|-----------|
| iDrive / MEGA / S3    | **REMOVED** – GitHub Releases holds bytes |
| Supabase Storage      | **REMOVED** – DB only |
| PocketBase            | **REMOVED** |
| File size limit       | **100 MB** (GitHub release asset hard-limit) |
| Admin UI              | **REMOVED** – no dashboard |
| API keys              | **moved to Supabase table** (`api_keys`) |
| Upload bearer check   | **db lookup**, not env var |
| Download path         | **302 redirect** to `https://github.com/owner/repo/releases/download/tag/app.apk` |
| Edge egress           | **~2 KB JSON** per user → **negligible** |

---

## 4. DATABASE (Supabase) – v2 schema

```sql
-- 1. API keys (write-only for service_role)
CREATE TABLE api_keys(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE,
  key TEXT UNIQUE,          -- bearer token
  created TIMESTAMPTZ DEFAULT now(),
  last_used TIMESTAMPTZ
);

-- 2. Releases (one row per GitHub release)
CREATE TABLE releases(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo TEXT,                -- "owner/repo"
  tag TEXT,                 -- "v1.2.3"
  asset_name TEXT,          -- "app-release.apk"
  asset_size INT8,
  published_at TIMESTAMPTZ,
  uploader TEXT,            -- api_keys.name
  github_url TEXT,          -- direct download URL (private repo needs token)
  UNIQUE(repo, tag)
);
```

RLS  
- `api_keys` → **NO SELECT for public**; only service_role.  
- `releases` → **public read**; **service_role insert**.

---

## 5. SVELTEKIT ENDPOINTS

### 5.1  `GET /`  (server-side load)
```ts
// src/routes/+page.server.ts
export async function load({ fetch }) {
  const { data } = await supabase.from('releases')
                                .select('*')
                                .order('published_at', { ascending: false });
  return { releases: data };
}
```
Page renders table / cards with **Download** buttons.

### 5.2  `GET /api/download?repo=owner/repo&tag=v1.2.3`
Edge function **never** streams bytes:
```ts
// src/routes/api/download/+server.ts
export async function GET({ url }) {
  const { repo, tag } = Object.fromEntries(url.searchParams);
  const { data } = await supabase.from('releases')
                                .select('github_url')
                                .eq('repo', repo)
                                .eq('tag', tag)
                                .single();
  if (!data) return json({ error: 'Not found' }, { status: 404 });

  // 302 to GitHub → Vercel counts **headers only** against limit
  return new Response(null, {
    status: 302,
    headers: { Location: data.github_url }
  });
}
```
**No 4.5 MB impact** – body is empty.

---

## 6. CI UPLOAD FLOW (GitLab example)

```yaml
variables:
  GITHUB_TOKEN: $GITHUB_TOKEN        # repo scoped
  API_ENDPOINT: https://apk.example.com

upload:
  stage: deploy
  script:
    # 1. Create GitHub release & upload asset
    - gh release create "$CI_COMMIT_TAG" build/app.apk --repo owner/repo
    # 2. Ask GitHub for the asset URL
    - ASSET_URL=$(gh release view "$CI_COMMIT_TAG" --repo owner/repo --json assets -q '.assets[0].url')
    # 3. Store metadata in Supabase
    - |
      curl -X POST "$API_ENDPOINT/api/upload" \
        -H "Authorization: Bearer $UPLOAD_API_KEY" \
        -F "repo=owner/repo" \
        -F "tag=$CI_COMMIT_TAG" \
        -F "asset_name=app.apk" \
        -F "asset_size=$(stat -c%s build/app.apk)" \
        -F "github_url=$ASSET_URL"
```

---

## 7. ENVIRONMENT (Vercel)

```
PUBLIC_SUPABASE_URL= https://xyz.supabase.co
PUBLIC_SUPABASE_ANON_KEY= eyJ...
SUPABASE_SERVICE_ROLE_KEY= eyJ...   # for /api/upload
GITHUB_TOKEN= ghp_...               # repo scoped, server-side only
```

---

## 8. RATE & LIMIT DISCUSSION

| Resource | Limit | Expected Use | Head-room |
|----------|-------|--------------|-----------|
| GitHub REST API | 5 000 pts / h / token | < 20 rel/day | huge |
| GitHub asset **download** | 60 anon/h/IP | 50 users ≈ 50 hits | OK * |
| Vercel Edge invocations | 100 k / day | < 100 | huge |
| Vercel Edge **response** | 4.5 MB | 0 MB (302) | huge |
| Supabase free DB | 500 MB | < 1 MB / 1000 rel | huge |

\* If users sit behind **NAT**, the 60/h/IP is **shared** → advise them to **login** (cookie) or use **GH token**; otherwise **cache signed URLs** for 5 min inside Edge to **collapse** bursts.

---

## 9. SECURITY delta

- **GitHub token never leaves server**; browser gets **302**.  
- **No delete/edit surface** → immutable releases.  
- **API key** in DB → rotate by `UPDATE api_keys SET key=...`.  
- **RLS** blocks public from reading keys.  
- **Private repo** keeps APK **hidden** from casual GitHub users.

---

## 10. DEPLOYMENT CHECKLIST v2

1. Supabase project + tables + RLS.  
2. Insert CI key:  
   ```sql
   INSERT INTO api_keys(name,key)
   VALUES('gitlab-ci',gen_random_uuid()::text);
   ```
3. GitHub **private repo** → grab **PAT** (`repo` scope).  
4. Push SvelteKit to Vercel → add env vars.  
5. GitLab CI variables:  
   `UPLOAD_API_KEY=<value from step 2>`  
   `GITHUB_TOKEN=<PAT>`  
6. Tag → pipeline green → release visible on `/`.

---

## 11. FUTURE-PROOFING (optional, no code now)

- If GitHub rate becomes painful → **cache** `download` endpoint for **5 min** (Edge).  
- If users > 50/day → **GitHub App** installation token (hourly refresh).  
- If repo > 1 → add `repo` selector on homepage.  
- **Never** add admin UI – keep **immutable** philosophy.

---

**End of v2 SDD** – immutable, zero-card, zero-storage-cost, single-page browser.