# Postgres Blog — Feature Reference

## Overview

The `/pg` route provides a blog management interface backed by PostgreSQL (or a local JSON file in development). Post metadata and content go through `/api/pg_blogs`; large file attachments go through `/api/pg_blogs/chunks`.

## Content Editor

- Same `ContentEditor` component (`src/components/ContentEditor.tsx`) as the Mongo route.
- Content stored and retrieved as **raw HTML**.
- List previews strip HTML tags. Preview modal renders HTML with `dangerouslySetInnerHTML` (script tags + `on*` attributes sanitized).

## Inline Image Paste

- Paste an image into the editor; it is compressed to `inlineImageMaxSizeMB` MB (default **3 MB**) and inserted as an `<img>` at the cursor.
- Images are base64 data URLs embedded in the `content` HTML string.
- Content field is sent via the standard `/api/pg_blogs` POST/PUT body (not chunked), so the 4.5 MB body parser limit applies to the overall request.

## File Attachments (Chunked Upload)

- One manual file attachment per post.
- On form submit, the file is read as `ArrayBuffer`, split into **2 MB chunks**, and uploaded sequentially to `/api/pg_blogs/chunks`.
- Chunks are reassembled in the `post_chunks` table linked by `post_id`.
- This mechanism supports arbitrarily large attachments (no Vercel body-parser bottleneck for attachments).
- Download served by `/api/pg_blogs/download/[id]`.
- On Edit, the existing attachment name is shown. Uploading a new file replaces all existing chunks.

## API Limits

- Main post body parser raised to **4.5 MB** to carry inline image content.
- Chunk uploads bypass the body limit because each chunk is ≤ 2 MB.

## Layout

- Two-column layout identical to Mongo route: sidebar left, ContentEditor right.
- Attachment UI in sidebar: dashed-border "Add file attachment" button when empty; compact single-row with filename + × remove button when a file is selected.

## Performance

- `src/app/pg/loading.tsx` renders a skeleton immediately on tab click.
- `ActiveNavLink` calls `router.prefetch()` to pre-warm the route.
- `router.refresh()` is called before navigation after save/update to invalidate the Next.js router cache so the updated list appears immediately.

## Local Development

- In local mode (`config/config.json` → `local.pgBlogStorage: "json"`), data persists to `config/localBlogData_postgres.json`.
- Chunk upload is skipped in JSON mode; attachment is stored as a single base64 string directly.
