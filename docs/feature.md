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
- Content editor is a WYSIWYG `contenteditable` div (ContentEditor component). Pasting an image compresses it (to `inlineImageMaxSizeMB` from config, default 3 MB) via `canvas.toBlob` and inserts it as an `<img>` element at the cursor — the image is visible inline while editing.
- Content is stored as raw HTML. List previews strip HTML tags for display. The preview modal renders HTML via `dangerouslySetInnerHTML` (script tags and `on*` event attributes sanitized before render).
- One manual file attachment is supported per post (uploaded on submit as base64). File attachments are separate from inline editor images and appear only in the sidebar.
- API body parser raised to 4.5 MB to accommodate inline image content.

### PG Blog Route

- `/pg` lists posts from the configured PG-route backend.
- Create, edit, delete, chunk upload, and attachment download still use `/api/pg_blogs*`.
- In JSON mode, changes persist only to `config/localBlogData_postgres.json`.
- In Postgres mode, metadata persists to the configured blog table and attachments to the configured chunk table.
- Create Post page uses the same two-column layout as Edit Post (sidebar + full-height content area).
- Content editor uses the same WYSIWYG `contenteditable` div (ContentEditor) as the Mongo route.
- API body parser is unlimited for the Postgres route because inline image content goes through the standard post body (which is also raised to 4.5 MB). Large file attachments continue to go through the chunk upload path (`/api/pg_blogs/chunks`) which supports unlimited sizes.
- Attachments section shows one compact file row with an × remove button when a file is selected, and a dashed-border "Add file attachment" button when empty.

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