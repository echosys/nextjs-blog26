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
- A successful login sets a signed, HttpOnly `session` cookie valid for 400 days; Logout clears it server-side via `POST /api/logout`.

### Mongo Blog Route

- `/blog/mongo` lists posts from the configured Mongo-route backend.
- Database connection errors are surfaced as a red error banner at the top of the page, with a Retry link (an empty list therefore always means no posts, not an outage).
- `all` tag behavior is normalized to no-filter so latest posts render consistently.
- Posts can be sorted by Date Created or Last Edited, each with ascending/descending order, via the sort control next to "New Post". Selection is stored in the `sort` query param (e.g. `?sort=updated_desc`) so it's shareable/bookmarkable.
- Post tiles show a compact meta row (created date, an "Edited" badge when the post has been updated, and tags) above a 2-line content preview, instead of a separate footer row, to fit more posts on screen.
- Editing a post and saving returns to the list with that post's preview reopened automatically (instead of the top of the list), so it's easy to keep refining the same post.
- The "Filter by Tags" sidebar is collapsible (chevron toggle in its header) so the post list can use the full width when tag filtering isn't needed.
- Clicking a post tile's pencil icon opens an inline "quick edit" split view (Outlook-style) instead of navigating away: a compact list of posts on the left, the edit form on the right. Opening quick edit auto-collapses the tags sidebar (restored to its prior state on close). The panel has its own Prev/Next buttons, a button to open the same post in the full standalone editor, and a close (X) button. The full-page editor at `/blog/mongo/edit/<id>` is still available directly or via that link, and also has Prev/Next buttons (based on the list order the user came from).
- In the quick-edit panel, Title/Tags/Attachment are arranged in one compact row above the content area (instead of a tall sidebar), so the content editor gets the full width and most of the vertical space.
- A floating round Save button stays fixed at the bottom-right of the screen while editing (both quick edit and the full-page editor), so long posts can be saved without scrolling back up to reach a Save button.
- If a post has unsaved changes, navigating away from it while editing (Prev/Next, switching posts in quick edit, or closing quick edit) shows a "Discard changes?" confirmation before proceeding. Saving successfully clears the unsaved state.
- Create, edit, delete, and attachment handling still use `/api/blogs`.
- In JSON mode, changes persist only to `config/localBlogData_mongo.json`.
- In Mongo mode, changes persist to the configured Mongo blog collection.
- Create Post page uses the same two-column layout as Edit Post (sidebar + full-height content area).
- Content editor is a WYSIWYG `contenteditable` div (ContentEditor component). Pasting an image:
  1. Detects the image from clipboard
  2. Re-encodes it as JPEG to ~`inlineImageTargetKB` (250 KB default), longest side capped at `inlineImageMaxDimensionPx` (1920 px); images already under the target keep their original bytes
  3. Inserts the **full compressed image** as an `<img>` tag in the editor
  4. Displays as a `100px` thumbnail (configurable: `inlineThumbnailMaxPx`) due to CSS styling
  5. User can drag edges to resize up to `inlineThumbnailMaxResizePx` (400px cap)
- Full image data is stored in the HTML `content` field; the thumbnail size is only a display property.
- Inline images appear in the sidebar "Inline Images" section with a download button (↓) and remove button (×).
- Image-only posts are valid (the editor detects both text and `<img data-inline-id>` elements for validation).
- Content is stored as raw HTML. List previews strip HTML tags for display. The preview modal and the editor sanitize stored HTML with DOMPurify before inserting it into the page.
- One manual file attachment is supported per post (uploaded on submit as base64). File attachments are separate from inline editor images and appear only in the sidebar.
- API body parser raised to 4.5 MB to accommodate inline image content. The whole post (content with base64 images + attachment) is sent in one request, so the editor checks the size before saving and shows a clear error above ~4.4 MB (Vercel's request limit). At 250 KB per image that is about 12 photo-like images, or more for screenshots, which compress smaller.

### PG Blog Route

- `/blog/pg` lists posts from the configured PG-route backend.
- Database connection errors are surfaced as a red error banner at the top of the page (e.g., timeout during schema init), with a Retry link.
- Posts can be sorted by Date Created or Last Edited, each with ascending/descending order, via the same sort control used on the Mongo route.
- Post tiles use the same denser layout as the Mongo route (compact meta row + 2-line preview), and editing a post returns to its reopened preview instead of the top of the list.
- Same collapsible tags sidebar, Outlook-style quick edit split view, Prev/Next navigation (standalone and quick edit), and unsaved-changes discard confirmation as the Mongo route (see above) — backed by `PgEditForm` instead of `MongoEditForm`.
- Create, edit, delete, chunk upload, and attachment download still use `/api/pg_blogs*`.
- In JSON mode, changes persist only to `config/localBlogData_postgres.json`.
- In Postgres mode, metadata persists to the configured blog table and attachments to the configured chunk table.
- Create Post page uses the same two-column layout as Edit Post (sidebar + full-height content area).
- Content editor uses the same WYSIWYG `contenteditable` div (ContentEditor) as the Mongo route, with inline images displayed as thumbnails.
- Inline images appear in the sidebar with download and remove buttons.
- One manual file attachment per post, uploaded via chunked upload to `/api/pg_blogs/chunks` (2MB chunks) which supports files up to 200 MB.
- API body parser set to 4.5 MB for main post content (accommodates inline images); chunk upload API set to 4 MB (2MB binary → ~2.67MB base64).

### Footer Runtime Indicators

- Footer backend badges are driven by runtime mode (`json`, `mongo`, `postgres`) from config resolution.
- Local JSON mode now shows JSON for both blog backends instead of hardcoded database labels.
- Each badge has a live dot: yellow while checking, green when connected, red with "Unreachable" (hover for the error) when the backend fails or doesn't answer within 15 s. The check runs on every page, including `/login`, so a visit also counts as database activity.

## Operational Features

- storage selection is centralized in `src/lib/storage.ts`
- server-rendered pages and API routes use the same storage adapter
- Mongo collections are created automatically if missing
- Postgres tables and indexes are created automatically if missing
- runtime actions are logged to `logs/runtime.log`

## API Summary

### Auth and Status

All API routes require a valid session (`401` otherwise) except login, logout, and the two status endpoints.

- `POST /api/login`: authenticate against the active login backend and set the session cookie
- `POST /api/logout`: clear the session cookie
- `GET /api/status`: report health for the active login backend (`?scope=blog` checks the Mongo blog backend instead)
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
