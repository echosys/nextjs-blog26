# Blog

## Purpose

Two parallel blog managers with the same UI: one backed by MongoDB (`/blog/mongo`), one by Postgres (`/blog/pg`). Both support a WYSIWYG editor with pasted inline images and one file attachment per post.

## Responsibilities

- List, preview, create, edit (full page and quick-edit panel), and delete posts; tag filter and sort.
- Compress pasted images client-side and store them (inline data URLs in Mongo; per-image chunks in Postgres).
- Upload and download attachments (single request in Mongo; 2 MB chunks in Postgres).
- Keep list payloads small (excerpts only; lazy-loaded preview bodies; download routes).

## Owned Paths

- `src/app/blog/**` — `layout.tsx` (titles only), `mongo/*`, `pg/*` pages and list/delete components.
- `src/components/**` — `ContentEditor`, `MongoEditForm`, `PgEditForm`, `PostPreview`, `SortControl`, `DiscardChangesDialog`.
- `src/lib/inlineImages.ts`, `src/lib/useInlineImages.ts`, `src/lib/editNav.ts`, `src/lib/requestSize.ts`.
- `src/pages/api/blogs.ts`, `src/pages/api/blogs/download/[id].ts`, `src/pages/api/pg_blogs.ts`, `src/pages/api/pg_blogs/**`, `src/pages/api/tags.ts`.

## Public Entry Points

- Pages: `/blog/mongo`, `/blog/mongo/new`, `/blog/mongo/edit/[id]`, `/blog/pg`, `/blog/pg/new`, `/blog/pg/edit/[id]` (old `/mongo`, `/pg` redirect).
- `/api/blogs` GET (list, or `?id=` with `&attachment=0` to skip the blob), POST, PUT, DELETE `?id=`.
- `GET /api/blogs/download/[id]` — Mongo attachment as a forced download.
- `/api/pg_blogs` GET/POST/PUT/DELETE; `/api/pg_blogs/inline-images` GET/POST/DELETE; `POST /api/pg_blogs/chunks`; `GET /api/pg_blogs/download/[id]`.
- `GET /api/tags` — Mongo tag cache.

## Key Files

- `src/components/ContentEditor.tsx` — contenteditable editor, paste handling, image compression (`inlineImageTargetKB`, `inlineImageMaxDimensionPx`).
- `src/lib/requestSize.ts` — pre-save size check for single-request (Mongo) saves (`maxSingleRequestBytes`).
- `src/lib/inlineImages.ts` — extract/restore inline images, attachment metadata JSON for Postgres.
- `src/lib/useInlineImages.ts` — parallel chunk fetches for preview and editing.
- `src/app/blog/mongo/page.tsx` — server-side excerpt projection for the list.

## Dependencies

- `storage` module (`src/lib/storage.ts` adapters, `runtimeConfig`).
- `auth` module (all routes and APIs require a session).
- `dompurify` for HTML sanitization.

## Data Models

See `docs/database.md` (Mongo `blog_entry`, `blog_login` tag cache; Postgres `posts`, `post_chunks`).

## Invariants

- Stored HTML is sanitized with DOMPurify before rendering or loading into the editor.
- Mongo list responses never include `attachment`; the page sends only excerpts to the client.
- Postgres inline image chunk indices start at 1000; file chunks use 0…N-1.
- Mongo saves are blocked client-side when the request would exceed `maxSingleRequestBytes`.

## Known Constraints

- Mongo: total post (images + attachment) per save ≈ 4.4 MB (Vercel body limit) → ~12 photo-like inline images.
- Postgres: partial inline-image upload failures can leave metadata pointing at missing chunks.
- Tag cache is recomputed with `distinct` on every Mongo write.

## Related Tests

- None yet (covered by manual/e2e checks; see `docs/feature_blog_image.md`).
