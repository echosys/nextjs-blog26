# Blog Manager Features

## Runtime Modes

The app is now config-driven for local versus deployment storage.

- Local runtime uses the `local` section of `config/config.json`.
- Deploy runtime uses the `deploy` section of `config/config.json`.
- Local is determined from localhost or non-production development execution.
- Deploy is determined from hosted requests.

Default behavior in the current config:

- local login: JSON file
- local Mongo route: JSON file
- local PG route: JSON file
- deploy login: MongoDB
- deploy Mongo route: MongoDB
- deploy PG route: Postgres

## User-Facing Behavior

### Login

- `/login` authenticates through the active login adapter.
- In local JSON mode, credentials come from `config/user.json`.
- In deploy Mongo mode, credentials come from the configured Mongo login collection.
- The login status card now shows the active storage label and mode instead of assuming MongoDB.

### Mongo Blog Route

- `/mongo` lists posts from the configured Mongo-route backend.
- `all` tag behavior is normalized to no-filter so latest posts render consistently.
- Create, edit, delete, and attachment handling still use `/api/blogs`.
- In JSON mode, changes persist only to `config/localBlogData_mongo.json`.
- In Mongo mode, changes persist to the configured Mongo blog collection.
- Create Post page uses the same two-column layout as Edit Post (sidebar + full-height content area).
- Inline image paste: pasting an image into the content textarea compresses it (to `inlineImageMaxSizeMB` from config) and embeds it as a markdown data-URL reference in the content; a thumbnail row appears in the Attachments section with an `inline ✓` status badge.
- Attachments section shows compact rows (thumbnail/icon, filename, size, status, × remove) instead of a single large upload button.
- One manual file attachment is supported per post (uploaded on submit as base64).

### PG Blog Route

- `/pg` lists posts from the configured PG-route backend.
- Create, edit, delete, chunk upload, and attachment download still use `/api/pg_blogs*`.
- In JSON mode, changes persist only to `config/localBlogData_postgres.json`.
- In Postgres mode, metadata persists to the configured blog table and attachments to the configured chunk table.
- Create Post page uses the same two-column layout as Edit Post (sidebar + full-height content area).
- Inline image paste: same compress-and-embed flow as Mongo; image size limit driven by `inlineImageMaxSizeMB` config.
- Attachments section shows compact rows; one manual file attachment uploaded via chunked upload on submit.
- Tab navigation: `loading.tsx` makes the blog list skeleton appear immediately on tab click; `router.prefetch` in `ActiveNavLink` pre-warms the other tab's route while the user is on the current tab.

### Footer Runtime Indicators

- Footer backend badges are driven by runtime mode (`json`, `mongo`, `postgres`) from config resolution.
- Local JSON mode now shows JSON for both blog backends instead of hardcoded database labels.

## Operational Features

- storage selection is centralized in `src/lib/storage.ts`
- server-rendered pages and API routes use the same storage adapter
- Mongo collections are created automatically if missing
- Postgres tables and indexes are created automatically if missing
- runtime actions are logged to `logs/runtime.log`

## API Summary

### Auth and Status

- `POST /api/login`: authenticate against the active login backend
- `GET /api/status`: report health for the active login backend
- `GET /api/pg_status`: report health for the active PG-route backend

### Mongo Route APIs

- `GET /api/blogs`: list posts or fetch one post by `id`
- `POST /api/blogs`: create a post
- `PUT /api/blogs`: update a post
- `DELETE /api/blogs?id=`: delete a post
- `GET /api/tags`: list tags for the active Mongo-route backend

### PG Route APIs

- `GET /api/pg_blogs`: list posts or fetch one post by `id`
- `POST /api/pg_blogs`: create post metadata
- `PUT /api/pg_blogs`: update post metadata
- `DELETE /api/pg_blogs?id=`: delete a post
- `POST /api/pg_blogs/chunks?id=&index=`: upload one attachment chunk
- `GET /api/pg_blogs/download/[id]`: download the assembled attachment