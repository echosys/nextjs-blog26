# Runtime Storage Architecture

This project now uses a config-driven storage layer so the same application code can run against local JSON files during localhost development and real databases in deployment.

## Core Flow

1. Runtime profile is resolved in `src/lib/runtimeConfig.ts`.
2. `local` is selected for localhost or non-production development flows.
3. `deploy` is selected for hosted environments.
4. The active profile reads storage modes from `config/config.json`.
5. `src/lib/storage.ts` dispatches each request to the correct adapter.

## Active Components

- `config/config.json`: single source of truth for local and deploy storage modes, collection names, table names, and JSON seed file paths.
- `config/user.json`: local JSON auth source when `local.loginMode = json`.
- `config/localBlogData_mongo.json`: local JSON blog source for the Mongo route when `local.mongoBlogMode = json`.
- `config/localBlogData_postgres.json`: local JSON blog source for the PG route when `local.postgresBlogMode = json`.
- `src/lib/storage.ts`: shared adapter entrypoint for auth, Mongo-style blog CRUD, Postgres-style blog CRUD, tag lookup, status checks, attachment download, and chunk uploads. `listMongoBlogs`/`listPgBlogs` accept a `sortField` (`createdAt` | `updatedAt`) and `sortOrder` (`asc` | `desc`); for `updatedAt` sorting, posts that were never edited fall back to `createdAt` so they still sort predictably.
- `src/lib/logger.ts`: appends runtime events to `logs/runtime.log`.
- `src/pages/api/*`: thin API routes that delegate to the storage layer.
- `src/app/mongo/page.tsx` and `src/app/pg/page.tsx`: server components that read through the same adapter layer as the APIs. Both parse a `sort` query param (`created_desc` default) and pass tag/sort data plus `blogs`/`posts` and `previewId` as props to their list component; the tags aside, heading, `SortControl`, and "New Post" link now live in the list components instead of these server components.
- `src/components/SortControl.tsx`: shared client component rendering the sort field/order controls; updates the `sort` query param via `router.push`.
- `src/app/mongo/MongoPostList.tsx` and `src/app/pg/PgPostList.tsx`: own the tags-filter aside (with a `tagsCollapsed` toggle), heading/`SortControl`/"New Post" row, and the post tile grid. On mount, if a `previewId` prop is present (set by the edit pages after a successful save), they reopen `PostPreview` at that post and then strip `previewId` from the URL via `router.replace` so the browser back button doesn't reopen it unexpectedly. They also call `setEditNavIds` (from `src/lib/editNav.ts`) with the current list's id order on every render, and manage an Outlook-style "quick edit" split view (see below).
- `src/lib/editNav.ts`: `sessionStorage`-backed helper — `setEditNavIds(route, ids)` records the currently-displayed list order per route (`'mongo'|'pg'`); `getAdjacentIds(route, currentId)` looks up the prev/next id for a given post. Used so the standalone edit pages can offer Prev/Next navigation without re-fetching the whole list. No-ops server-side and on storage errors.
- `src/components/MongoEditForm.tsx` and `src/components/PgEditForm.tsx`: the actual edit-post form UI/logic (previously inline in `src/app/mongo/edit/[id]/page.tsx` / `src/app/pg/edit/[id]/page.tsx`), now shared between two usages via a `variant` prop:
  - `variant="page"`: standalone full-page editor — on save, redirects to `/mongo?success=true&previewId=<id>` (or the `/pg` equivalent), same as before. Layout unchanged (sidebar + content grid).
  - `variant="panel"`: inline "quick edit" panel — on save, stays open, shows a transient "Saved" indicator, and calls `onSaved(id)` instead of redirecting. Layout is a single-column stack: a compact top card with Title/Tags/Attachment side-by-side, followed by the content editor using the remaining width/height (no sidebar), since the panel already shares horizontal space with the compact post list to its left.
  Both variants track an internal `isDirty` flag (via `ContentEditor`'s new `onChange` prop plus the title/tags/file inputs) and expose an imperative `EditFormHandle.requestNavigate(targetId | null)` (via `forwardRef`/`useImperativeHandle`) so external navigation (list rows, Prev/Next, close) can trigger the same dirty-check gate the in-form buttons use. When dirty, navigation is deferred and `src/components/DiscardChangesDialog.tsx` (shared confirm modal) is shown before proceeding. Both variants also render a `position: fixed` floating round Save button at the bottom-right of the viewport (submitting the form via its `id`/`form` attribute pairing) so saving a long post never requires scrolling back up to a header/sidebar Save button.
- `src/app/mongo/edit/[id]/page.tsx` and `src/app/pg/edit/[id]/page.tsx`: now thin client wrappers — resolve `{prevId, nextId}` via `getAdjacentIds`, and render `<MongoEditForm variant="page" .../>` / `<PgEditForm variant="page" .../>` (remounted via `key={id}` on navigation).
- `src/app/layout.tsx`: footer badges are driven by runtime config mode instead of hardcoded environment assumptions.

## Storage Modes

### Login

- `json`: validate against `config/user.json`.
- `mongo`: validate against the configured Mongo login collection.

### Mongo Blog Route

- `json`: read and write blog posts from `config/localBlogData_mongo.json`.
- `mongo`: read and write blog posts from the configured Mongo blog collection.

### Postgres Blog Route

- `json`: read and write blog posts from `config/localBlogData_postgres.json` using Postgres-shaped responses.
- `postgres`: read and write blog posts from the configured Postgres tables.

## Cross-Backend Consistency Rules

- The adapter treats `tag=all` as no-filter for both Mongo and PG route listing functions.
- Backend selection changes only storage target, not filtering semantics.
- Local JSON behavior mirrors deploy behavior: Mongo and PG routes are isolated from each other.

## Store Bootstrap Optimization

### Postgres Schema Caching
- `ensurePostgresSchema` runs CREATE TABLE/INDEX IF NOT EXISTS queries on first use within each Lambda instance.
- Results are cached in a module-level Promise (`pgSchemaInitPromise`) to avoid redundant schema operations on subsequent requests in the same process.
- If schema init fails, the cache is cleared so the next request retries.
- This reduces Vercel serverless timeout risk by eliminating repeated schema overhead.

## Bootstrap Behavior

The adapter layer performs storage bootstrap before use.

- MongoDB: creates the configured login and blog collections if they do not exist.
- MongoDB: upserts a dedicated `tag-cache` metadata document in the login collection.
- Postgres: creates the configured blog and attachment tables if they do not exist.
- Postgres: creates the required indexes for created date, tags, and chunk lookup.

## Logging

Key runtime actions are written to `logs/runtime.log`.

- auth adapter selection
- JSON file loads and writes
- Mongo bootstrap and CRUD actions
- Postgres bootstrap and CRUD actions
- chunk uploads and storage failures

## Request Path Summary

1. UI calls `/api/login`, `/api/blogs`, `/api/pg_blogs`, `/api/status`, or `/api/pg_status`.
2. The route forwards the request host to `src/lib/storage.ts`.
3. The storage layer resolves `local` or `deploy`.
4. The storage layer picks the configured backend.
5. The backend is bootstrapped if needed.
6. The route returns the same response shape expected by the existing UI.