# Postgres Blog — Feature Reference

## Overview

The `/pg` route provides a blog management interface backed by PostgreSQL (or a local JSON file in development). Post metadata and content go through `/api/pg_blogs`; file attachments and inline images go through dedicated chunk endpoints.

## Content Editor

- Same `ContentEditor` component (`src/components/ContentEditor.tsx`) as the Mongo route.
- Content stored and retrieved as **raw HTML**.
- List previews strip HTML tags. Preview modal renders HTML with `dangerouslySetInnerHTML` (script tags + `on*` attributes sanitized).

## Inline Image Paste (Chunked Storage)

Unlike MongoDB (which stores inline images directly in content), Postgres uses a **chunked storage model** to avoid database history bloat:

- Paste an image into the editor; it is compressed to `inlineImageMaxSizeMB` MB (default **3 MB**) and inserted as an `<img>` at the cursor. Images already under 3 MB are stored without re-encoding.
- Images are NOT stored as base64 data URLs in the content field. Instead:
  - Content stores placeholder `<img data-inline-image-id="uuid" alt="filename" src=""/>` tags
  - Actual image data is stored in the `post_chunks` table. Each inline image occupies one chunk at a **fixed offset index** (starting at 1000)
  - File attachment chunks occupy indices 0..F-1; inline image chunks occupy indices 1000, 1001 … (never overlap)
  - Image metadata is stored as JSON in the `attachment_name` field:
    ```json
    {
      "file": { "name": "user.pdf", "chunks": [0, 1, 2] },
      "inline_images": [
        { "id": "abc123", "name": "photo.jpg", "chunks": [1000] },
        { "id": "def456", "name": "chart.jpg", "chunks": [1001] }
      ]
    }
    ```
- On render:
  - Client fetches each inline image chunk by its exact index via `/api/pg_blogs/inline-images?id=postId&chunkIndex=N`
  - Chunks are reconstructed into base64 data URLs
  - Placeholders are replaced with data URLs via client-side DOM manipulation

## Why Chunking for Inline Images?

- **Prevents history bloat**: Row versioning systems (audit logs, backups) multiply storage usage. Storing large images in the content column causes exponential growth on each edit.
- **Scalabilty**: Each inline image can be up to 4 MB; combined content + all images can exceed typical request body limits without chunking.
- **Efficient column updates**: Content row size stays small; only image data is chunked.

## File Attachments (Chunked Upload)

- One manual file attachment per post.
- On form submit, the file is read as `ArrayBuffer`, split into **2 MB chunks**, and uploaded sequentially to `/api/pg_blogs/chunks` with positive indices (0, 1, 2...).
- Chunks are reassembled in the `post_chunks` table linked by `post_id`.
- This mechanism supports arbitrarily large attachments (no Vercel body-parser bottleneck for attachments).
- Download served by `/api/pg_blogs/download/[id]`.
- On Edit, the existing attachment name is shown. Uploading a new file replaces all existing file chunks (indices 0..F-1). Inline image chunks (indices 1000+) are always re-uploaded on save.

## API Limits

- Main post body parser raised to **4.5 MB** for content that contains inline image placeholders (no base64).
- Chunk uploads bypass the body limit because each chunk is ≤ 4 MB (4 MB per inline image, 2 MB per file attachment chunk).

## Database Schema

```sql
CREATE TABLE blogs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,           -- Contains only placeholder <img> tags, no base64
  tags TEXT[] DEFAULT ARRAY[],
  attachment_name TEXT,             -- JSON: { file: {name, chunks:[]}, inline_images: [{id,name,chunks:[]}] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE post_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES blogs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,               -- base64-encoded
  UNIQUE (post_id, chunk_index)
);

-- Chunk indexing convention:
-- chunk_index 0 .. F-1  : file attachment chunks (F = ceil(fileSize / 2 MB))
-- chunk_index 1000+     : inline image chunks (1000 = first image, 1001 = second, ...)
-- Gap between F-1 and 1000 is intentional: allows up to ~2 GB attachments without conflicts
```

## Layout

- Two-column layout identical to Mongo route: sidebar left, ContentEditor right.
- Attachment UI in sidebar: dashed-border "Add file attachment" button when empty; compact single-row with filename + × remove button when a file is selected.

## Performance

- `src/app/pg/loading.tsx` renders a skeleton immediately on tab click.
- `ActiveNavLink` calls `router.prefetch()` to pre-warm the route.
- `router.refresh()` is called before navigation after save/update to invalidate the Next.js router cache so the updated list appears immediately.

## Local Development

- In local mode (`config/config.json` → `local.pgBlogStorage: "json"`), data persists to `config/localBlogData_postgres.json`.
- Chunk upload is skipped in JSON mode; inline images are stored as base64 data URLs directly in content (for simplicity).

## Difference from MongoDB

| Aspect | MongoDB | Postgres |
|--------|---------|----------|
| **Inline Images** | Embedded as base64 in `content` field | Stored in `post_chunks` at indices 1000+; `content` has placeholders |
| **Storage Model** | Single document with all data | Separate rows for content and chunks |
| **History Bloat Risk** | Higher: each edit replaces entire content | Lower: content row small; only chunks updated |
| **Upload Flow** | Single request; limited by 4.5 MB body parser | Chunked uploads; no practical size limit |
| **Document Size Limit** | 16 MB BSON; 4.5 MB Vercel request limit | No document size limit; chunk size capped at 4 MB |

