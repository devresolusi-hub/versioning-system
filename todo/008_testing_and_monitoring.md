# 008 – Testing & Monitoring

## Tasks
- [ ] Set up testing framework
  - [ ] Install testing dependencies (Vitest, Playwright, or preferred)
  - [ ] Configure test scripts in `package.json`
- [ ] Write API endpoint tests
  - [ ] Test valid API key authentication → 201 response
  - [ ] Test invalid API key → 401 response
  - [ ] Test inactive API key → 401 response
  - [ ] Test missing Authorization header → 401 response
  - [ ] Test missing required fields → 400 response
  - [ ] Test duplicate version → 409 response
  - [ ] Test file too large → 413 response
  - [ ] Test successful file upload → verify database records
  - [ ] Test `is_latest` flag update → verify trigger works
  - [ ] Test `last_used_at` update → verify timestamp updated
- [ ] Write frontend tests
  - [ ] Test home page loads and displays files
  - [ ] Test empty state display
  - [ ] Test error state display
  - [ ] Test download link generation
  - [ ] Test version sorting (newest first)
  - [ ] Test latest badge display
- [ ] Implement logging
  - [ ] Add structured logging for uploads
    - [ ] Log: timestamp, action, fileName, version, fileSize, status, duration, ip
  - [ ] Add error logging
    - [ ] Log: timestamp, action, fileName, version, status, errorCode, errorMessage, ip
  - [ ] Use console.log for development, structured JSON for production
- [ ] Set up error tracking (optional)
  - [ ] Consider integrating error tracking service (Sentry, etc.)
  - [ ] Log errors with context (fileName, version, API key used)
- [ ] Create monitoring queries
  - [ ] Document SQL queries for monitoring:
    - [ ] Total uploads per day/week/month
    - [ ] Failed upload attempts
    - [ ] Storage space used
    - [ ] Most active API keys
    - [ ] Unused API keys
- [ ] Create troubleshooting guide
  - [ ] Document common issues from SDD Appendix B
  - [ ] Add solutions for:
    - [ ] 401 Unauthorized errors
    - [ ] 409 Conflict errors
    - [ ] 413 Payload Too Large errors
    - [ ] Download link issues
  - [ ] Add SQL queries for debugging

## Files to Create
- `src/routes/api/upload/+server.test.ts` (or similar)
- `src/routes/+page.test.ts` (or similar)
- `docs/troubleshooting.md`
- `docs/monitoring-queries.sql`

## Commands to Run
```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Expected Outcome
- Test suite covering critical functionality
- Structured logging for uploads and errors
- Monitoring queries documented
- Troubleshooting guide available
- All tests passing

