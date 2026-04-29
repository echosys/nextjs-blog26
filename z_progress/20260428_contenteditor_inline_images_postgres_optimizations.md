# 20260428 ContentEditor, Inline Images, Postgres Optimizations

## What changed

### ContentEditor Component (WYSIWYG Blog Editor)
- Created `src/components/ContentEditor.tsx`: a `contenteditable` div wrapper for WYSIWYG blog content editing.
- On image paste: images are compressed via `canvas.toBlob` to max `inlineImageMaxSizeMB` (3 MB from config).
- Full compressed image stored as `<img data-inline-id>` tag in HTML; CSS `width: 100px` displays as thumbnail.
- Sidebar UI added to all four form pages: "Inline Images" section with download (↓) and remove (×) buttons per image.
- `ContentEditor.isEmpty()` validates both text content and inline images, allowing image-only posts.
- Image metadata (filename, size KB) attached to `<img>` data attributes for sidebar display.

### Form Page Updates (Create & Edit)
- `src/app/mongo/new/page.tsx`, `src/app/pg/new/page.tsx`, `src/app/mongo/edit/[id]/page.tsx`, `src/app/pg/edit/[id]/page.tsx`:
  - Replaced textarea with `<ContentEditor>` component.
  - Added inline images tracking state (`inlineImages: InlineImageItem[]`).
  - Added download + remove buttons in sidebar for each inline image.
  - Changed form submit navigation from `router.push()` (cached) to `window.location.href` (hard page reload) for fresh data.
  - Removed `useRouter` import and router prefetch logic.

### Postgres Optimization: Schema Caching
- `src/lib/storage.ts`: Added module-level `pgSchemaInitPromise` Promise cache.
- `ensurePostgresSchema(host)` now runs CREATE TABLE/INDEX IF NOT EXISTS queries only on first Lambda invocation.
- Subsequent requests within the same Lambda instance reuse the cached Promise.
- On error, cache clears so next request retries schema init.
- Reduces cold-start timeout risk on Vercel by eliminating redundant 5+ DB operations per request.

### Error Handling & Observability
- `src/app/pg/page.tsx`: Modified `getPgPosts()` wrapper to catch errors and return `{ posts, tags, error }`.
- If database error, displays red error banner with message + Retry link instead of silent "No posts found".
- Imports `AlertTriangle` icon for visual error indication.
- `src/pages/api/pg_blogs/chunks.ts`: Added `console.error('[chunks] uploadPgChunk failed:', error?.message, error?.stack)`.
- Chunk upload failures now visible in Vercel function logs with full stack trace for debugging.

### Navigation Optimization
- `src/app/components/ActiveNavLink.tsx`: Removed `useRouter` hook, `useEffect`, and all `router.prefetch()` logic.
- Prefetch was caching stale empty-list responses when Postgres schema init was slow.
- Now: simple Link component with `usePathname` for active state detection only.

### API & Config Updates
- API body parser limits raised to 4.5 MB for `/api/blogs` and `/api/pg_blogs` (accommodates 3 MB inline images).
- `/api/pg_blogs/chunks`: set to 4 MB (2 MB binary chunk → ~2.67 MB base64).
- Added config keys: `inlineThumbnailMaxPx: 100`, `inlineThumbnailMaxResizePx: 400`.

### Documentation Updates
- `docs/architecture.md`: Schema caching section already present (schema init Promise, cache clearing, Lambda lifetime optimization).
- `docs/feature.md`: Already documented inline image behavior (compression, full storage, thumbnail display, download/remove, image-only validation).
- `docs/database.md`: Expanded "Error Handling & Observability" section with Postgres error surfacing, chunk upload logging, schema cache recovery.

## Why it changed

### User Experience
- Inline image pasting with compression was requested to streamline content creation; storing full images lets users download originals from sidebar.
- Image-only posts are common for visual blogs; validation updated to accept them as valid content.
- Two-column layout (sidebar + editor) now consistent across Create and Edit Post pages.
- Red error banners make database problems visible instead of silently failing.

### Performance & Reliability
- Postgres on Vercel was timing out because `ensurePostgresSchema()` ran 5+ CREATE TABLE/INDEX operations + file I/O on EVERY request.
- Cold start response time hit Vercel's 10-second function timeout, causing silent failure (error caught without surfacing).
- Schema caching reduces overhead to 1 operation per Lambda function instance lifetime; subsequent requests hit cache.
- `router.prefetch()` was caching stale empty-list responses from slow Postgres queries, showing "No posts found" UI even when data existed.
- Hard navigation (`window.location.href`) guarantees fresh DB read on form submission return.

### Code Quality
- All chunked file failures now logged with stack trace for Vercel debugging.
- ContentEditor component centralizes image compression, validation, and storage logic (reduces duplication across 4 form pages).
- Error surfacing prevents silent failures (e.g., returning `[]` on timeout instead of showing error banner).

## Assumptions

- **Lambda Instance Lifetime**: Promise cache (`pgSchemaInitPromise`) relies on module-level semantics within Node.js process. Vercel Lambda instances live long enough to benefit from caching across 2+ requests.
- **Body Parser Limits**: 4.5 MB is sufficient for 3 MB inline image + JSON envelope. If larger images required, must increase parser limits further.
- **Hard Navigation**: `window.location.href` is appropriate for form submission returns; trade-off between data freshness and no client-side router cache.
- **Image Compression**: Canvas `toBlob` compression to `inlineImageMaxSizeMB` (3 MB) is lossless enough for blog previews; users can download originals from sidebar.
- **Chunk Upload**: 2 MB per-chunk size is efficient for chunked uploads; 4 MB API body limit is sufficient for base64-encoded chunks.
- **Error Recovery**: Retry link in error banner is sufficient UX; middleware/automatic retry may be added in future.
- **File I/O**: `ensurePostgresSchema()` file operations (reading SQL from disk) are acceptable on first call; caching prevents repeat overhead.
