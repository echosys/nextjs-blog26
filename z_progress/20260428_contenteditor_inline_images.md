# 2026-04-28 — ContentEditor & Inline Image Bugfixes

## What was changed

### New component: `src/components/ContentEditor.tsx`
- `forwardRef` component using `contenteditable` div (not a `<textarea>`).
- Exposes `getHTML(): string` and `isEmpty(): boolean` via ref.
- On paste: images are compressed via `canvas.toBlob` to `inlineImageMaxSizeMB` (from `config.json`) and inserted as `<img>` at cursor; non-image data is pasted as plain text.
- `initialContent` is hydrated once (guarded by a `hydrated` ref) to avoid cursor-jump on re-render.
- Shows a compact loading spinner during image compression.

### Rewritten form pages (all 4)
- `src/app/mongo/new/page.tsx`
- `src/app/pg/new/page.tsx`
- `src/app/mongo/edit/[id]/page.tsx`
- `src/app/pg/edit/[id]/page.tsx`

All pages now:
- Use `ContentEditor` (WYSIWYG) instead of `<textarea>`.
- Two-column layout: `lg:grid-cols-[320px_minmax(0,1fr)]` — sidebar (title, tags, file attachment, submit) + full-height editor.
- Submit handler reads `editorRef.current?.getHTML()`, checks `!res.ok` and throws on API error.
- Calls `router.refresh()` before `router.push()` to invalidate Next.js router cache.
- Single file attachment state (`fileObj: File | null`), not an array.
- No inline image rows in sidebar — images live in the editor HTML only.

### API body parser limit raised
- `src/pages/api/blogs.ts`: `export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }`
- `src/pages/api/pg_blogs.ts`: same

This was the root cause of silent Postgres post-creation failures. The default 1 MB limit was silently rejecting requests that contained inline images (3 MB base64 content), but the old code did not check `res.ok`, navigating to "saved successfully" anyway.

### List preview fix
- `MongoPostList.tsx` and `PgPostList.tsx`: added `stripHtml()` helper (strips all HTML tags) for the card preview paragraph; added `break-words` class to prevent horizontal overflow from long base64 substrings.

### Preview modal fix
- `PostPreview.tsx`: replaced plain `{post.content}` with `dangerouslySetInnerHTML`. Script tags and `on*` attributes are stripped before render. Added `[&_img]:max-w-full [&_img]:rounded-lg` so inline images are responsive in the modal.

### Documentation updated
- `docs/feature.md`: updated Mongo and PG sections to describe ContentEditor, HTML storage, and body parser limit.
- `docs/features_mongo_blog.md`: fully written (was empty) — describes content editor, inline images, attachments, API limits, layout, tab navigation.
- `docs/features_postgres_blog.md`: fully written (was empty) — same + chunk upload detail.

## Why these changes were made

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Postgres posts silently failing | Default Next.js 1 MB body limit rejected 3 MB inline image content; `res.ok` was never checked | Raised to 4.5 MB; added `if (!res.ok) throw` in submit handlers |
| Word wrap / horizontal scroll | Raw HTML / base64 data URLs have no spaces to wrap on | Store as HTML, strip tags for list previews, use `break-words` |
| Inline images not visible in editor | `<textarea>` cannot render HTML | Replaced with `contenteditable` ContentEditor; images inserted as `<img>` elements |
| Edit page loses inline images on reload | Images were in React state, lost on navigation | Images are part of saved `content` HTML, reloaded via `initialContent` prop |

## Assumptions
- Content is stored as raw HTML. No markdown. This is a private internal tool so no external rendering pipeline is involved.
- The 4.5 MB API body limit matches Vercel's maximum request body size. MongoDB doc limit (16 MB) is secondary.
- XSS sanitization (strip `<script>` + `on*` attributes) is sufficient for a private tool. A full sanitization library (e.g. DOMPurify) can be added if the tool becomes multi-user.
