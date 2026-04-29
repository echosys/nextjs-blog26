# 2026-04-28 — Create Post UI Redesign + Inline Image Paste + Tab Preload

## What was changed

### 1. config/config.json
- Added `inlineImageMaxSizeMB: 3` — controls the maximum size of inline pasted images after browser-side compression/scaling.

### 2. src/lib/runtimeConfig.ts
- Added `inlineImageMaxSizeMB: number` to the `RuntimeConfig` type to keep the type in sync with `config/config.json`.

### 3. src/app/mongo/new/page.tsx — full rewrite
- Layout changed from single-column (`max-w-2xl`) to two-column grid (`lg:grid-cols-[320px_minmax(0,1fr)]`) matching the Edit Post layout.
- Title, Tags, Attachments section, and Publish button moved to a sticky left sidebar.
- Content textarea is now a full-height controlled component occupying the right column.
- **Multi-attachment state**: `attachments` is now an array of `AttachmentItem` objects (`{id, name, size, type, status, dataUrl?, file?}`).
- **Inline image paste**: `onPaste` intercepts clipboard images, compresses them via canvas (JPEG, scales to fit within `MAX_IMAGE_MB`), inserts `![pastedId](dataUrl)` at cursor position in the textarea, and adds a thumbnail row to the attachments list with `inline ✓` status.
- **Compression algorithm**: progressively reduces JPEG quality (0.85→0.3), then pixel dimensions (×0.8 per step) until image fits within the configured MB limit.
- **Attachment rows UI**: compact rows with thumbnail/icon, filename, file size, status badge, and × remove button — replaces the single large upload drop zone.
- Removing an inline attachment strips the `![id](...)` markdown reference from the content via regex.
- One manual file attachment still supported (acts as the `attachment`/`attachmentName` on submit); the "Add file attachment" button is hidden while one is already queued.

### 4. src/app/pg/new/page.tsx — full rewrite
- Same two-column layout and inline paste logic as the Mongo new page above.
- Submit flow unchanged for file attachments: chunked upload via `/api/pg_blogs` + `/api/pg_blogs/chunks`.
- Content is now a controlled state (`useState("")`) sourced directly instead of via `FormData.get("content")`.
- `import runtimeConfig from "../../../../config/config.json"` reads `inlineImageMaxSizeMB` at bundle time.

### 5. src/app/pg/loading.tsx — new file
- Next.js App Router Suspense loading UI for the `/pg` route.
- Shows an animated skeleton matching the sidebar + post-list layout.
- Renders immediately on tab click — fixes the "nothing happens while Postgres is slow" UX issue.

### 6. src/app/mongo/loading.tsx — new file
- Same skeleton loading UI for the `/mongo` route for symmetry.

### 7. src/app/components/ActiveNavLink.tsx
- Added `useEffect` that calls `router.prefetch(href)` for the **non-active** link.
- Causes Next.js to pre-fetch and pre-render the other tab's route while the user is on the current tab, reducing perceived latency when switching.

## Why it was changed

1. **Create Post UI**: The original form was a narrow single-column layout that underutilised screen space and buried the content area. The Edit Post page already used the superior two-column layout; creating aligned both experiences.
2. **Inline images**: Users frequently paste screenshots and diagrams into blog posts. Manual file-then-reference workflow was cumbersome. Inline paste with in-browser compression avoids needing backend changes while keeping data URLs within a safe size limit.
3. **Tab switching lag**: The Postgres blog tab is backed by a live DB query. On busy or cold connections the browser appeared frozen. `loading.tsx` shows feedback instantly; `router.prefetch` warms the server-side query in the background.

## Assumptions

- Pasted images are stored as JPEG data URLs embedded directly in the `content` field (no schema change needed). Images ≤ 3 MB (compressed) are acceptable for both MongoDB documents and Postgres TEXT columns at expected post volumes.
- Multiple inline images per post are supported (all embedded in content text). Only ONE separate binary file attachment per post is supported — this matches the existing backend constraint.
- The 3 MB limit is intentionally conservative; it can be raised by changing `inlineImageMaxSizeMB` in `config/config.json`.
- `loading.tsx` requires Next.js App Router Suspense — already in use via `force-dynamic`.
