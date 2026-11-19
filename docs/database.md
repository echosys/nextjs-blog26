# Storage Reference

This app supports three storage backends behind one adapter layer: JSON files, MongoDB, and Postgres.

## Runtime Config

All runtime storage settings live in `config/config.json`.

```json
{
  "local": {
    "loginMode": "json",
    "mongoBlogMode": "json",
    "postgresBlogMode": "json",
    "trackerMode": "json",
    "opsMode": "json"
  },
  "deploy": {
    "loginMode": "mongo",
    "mongoBlogMode": "mongo",
    "postgresBlogMode": "postgres",
    "trackerMode": "mongo",
    "opsMode": "mongo"
  },
  "mongo": {
    "databaseName": "blog_2026",
    "loginCollection": "blog_login",
    "blogCollection": "blog_entry"
  },
  "postgres": {
    "blogTable": "posts",
    "attachmentTable": "post_chunks"
  },
  "ops": {
    "keepAliveRunsCollection": "ops_keepalive_runs",
    "loginAttemptsCollection": "ops_login_attempts",
    "retentionDays": 90,
    "recentListLimit": 25
  },
  "tracker": {
    "entriesCollection": "tracker_entries",
    "categoriesCollection": "tracker_categories",
    "todosCollection": "tracker_todos",
    "regularTodoWindowDays": 3,
    "activeTodoLimit": 15,
    "analyticsRangesDays": [7, 30, 90, 365],
    "heatmapWeeks": 53,
    "defaultCategories": ["...see config/config.json"]
  },
  "json": {
    "loginFile": "config/user.json",
    "mongoBlogFile": "config/localBlogData_mongo.json",
    "postgresBlogFile": "config/localBlogData_postgres.json",
    "trackerFile": "config/localTrackerData.json",
    "opsFile": "config/localOpsData.json",
    "mockSchemaFile": "config/mockSchema.json"
  }
}
```

## Local JSON Files

### Login File

Path: `config/user.json`

```json
{
  "users": [
    {
      "login": "test",
      "pw": "testpw"
    }
  ]
}
```

### Mongo Blog File

Path: `config/localBlogData_mongo.json`

```json
{
  "posts": [
    {
      "id": "1",
      "title": "Example",
      "content": "Local JSON post",
      "tags": ["local", "json"],
      "attachment": "data:application/octet-stream;base64,...",
      "attachmentName": "example.txt",
      "attachmentChunks": ["...base64 chunk..."],
      "createdAt": "2026-04-06T00:00:00.000Z",
      "updatedAt": "2026-04-06T00:00:00.000Z"
    }
  ]
}
```

### Postgres Blog File

Path: `config/localBlogData_postgres.json`

```json
{
  "posts": [
    {
      "id": "1",
      "title": "Example",
      "content": "Local JSON post",
      "tags": ["local", "json"],
      "attachment": "data:application/octet-stream;base64,...",
      "attachmentName": "example.txt",
      "attachmentChunks": ["...base64 chunk..."],
      "createdAt": "2026-04-06T00:00:00.000Z",
      "updatedAt": "2026-04-06T00:00:00.000Z"
    }
  ]
}
```

Notes:

- The Mongo route and PG route use separate local JSON files to mirror deploy-time storage separation.
- JSON attachment chunks are mirrored into a generic data URL so the Mongo-style UI can still offer downloads.

## MongoDB Layout

Database name comes from `config/config.json -> mongo.databaseName`.

### Blog Collection

Collection name comes from `mongo.blogCollection`.

```json
{
  "_id": "ObjectId",
  "title": "String",
  "content": "String",
  "tags": ["String"],
  "attachment": "Base64 data URL",
  "attachmentName": "String",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Login Collection

Collection name comes from `mongo.loginCollection`.

User documents:

```json
{
  "_id": "ObjectId",
  "login": "String",
  "pw": "String"
}
```

Tag cache document:

```json
{
  "_id": "ObjectId",
  "documentType": "tag-cache",
  "tags": ["String"]
}
```

Bootstrap behavior:

- creates both collections if missing
- upserts the `tag-cache` document if missing

### Tracker Collections

Names come from `tracker.*Collection` in `config/config.json`. Local JSON mode stores the same shapes as arrays in `config/localTrackerData.json` (`{ categories, entries, todos }`, string ids).

`tracker_categories` (unique index `key_1`):

```json
{
  "_id": "ObjectId",
  "key": "String (immutable, never reused)",
  "name": "String",
  "type": "boolean | amount",
  "unit": "String (amount only, optional)",
  "goal": "Number (amount only, optional)",
  "createdAt": "Date",
  "startedOn": "YYYY-MM-DD (absent for seeded defaults)",
  "retiredOn": "YYYY-MM-DD (present = retired, read-only)",
  "replacedBy": "String (key of the category created by a rename/retype)"
}
```

`tracker_entries` (unique index `date_1`, one document per local day):

```json
{
  "_id": "ObjectId",
  "date": "YYYY-MM-DD",
  "notes": "String",
  "metrics": { "<category key>": "true | Number" },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

`tracker_todos` (index `kind_1_doneAt_1_dueAt_1`):

```json
{
  "_id": "ObjectId",
  "title": "String",
  "kind": "regular | longterm",
  "tier": "1 | 2",
  "createdAt": "Date",
  "dueAt": "Date (regular only: createdAt + regularTodoWindowDays)",
  "doneAt": "Date (optional)",
  "doneDate": "YYYY-MM-DD (local day completed; links to the journal)"
}
```

Relationships:

- `entries.metrics` keys → `categories.key` (many entries reference one category; values are only written for active categories).
- `categories.replacedBy` → `categories.key` (chain of replacements after renames/retypes).
- `todos.doneDate` → `entries.date` (soft link by day; an entry need not exist).

Bootstrap behavior: indexes are created and `tracker.defaultCategories` are inserted on first use when the categories collection is empty (JSON mode: when the file has no `categories`).

Migration notes:

- No migrations are needed for category edits: renames/retypes add a document and set `retiredOn`/`replacedBy` on the old one; deletes only set `retiredOn`. Existing entry metrics are never rewritten.
- Documents created before the lifecycle fields existed are treated as active categories without a start day.
- Changing `tracker.defaultCategories` only affects new, empty stores; existing categories are left as-is.

### Ops Collections (keep-alive log, login audit)

Names come from `ops.*Collection`. Both have a TTL index on `at` (`expireAfterSeconds = ops.retentionDays × 86400`, default 90 days) that also serves newest-first queries. Local JSON mode stores `{ keepAliveRuns, loginAttempts }` (newest first, trimmed to the retention window on write) in `config/localOpsData.json` (git-ignored; contains IPs).

`ops_keepalive_runs` (one per `/api/keepalive` call while keep-alive is enabled):

```json
{
  "_id": "ObjectId",
  "at": "Date",
  "source": "cron | login-page | settings | api",
  "results": [{ "backend": "mongo | postgres", "configured": "Boolean", "ok": "Boolean", "ms": "Number", "message": "String (on failure)" }]
}
```

`ops_login_attempts` (one per `POST /api/login`; passwords are never stored):

```json
{
  "_id": "ObjectId",
  "at": "Date",
  "login": "String (attempted username, or \"(invalid)\")",
  "success": "Boolean",
  "outcome": "success | invalid-credentials | invalid-input | error",
  "ip": "String (first x-forwarded-for hop, x-real-ip, or socket address)",
  "userAgent": "String (≤ 300 chars)"
}
```

Bootstrap: TTL indexes are created on first use. Migration: none; changing `ops.retentionDays` later requires dropping and recreating the `at_1` index (or `collMod`) because existing TTL indexes keep their original expiry.

## Postgres Layout

Table names come from `postgres.blogTable` and `postgres.attachmentTable`.

### Blog Table

```sql
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  attachment_name TEXT,          -- JSON: { "file": "name", "inline_images": [...] }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
```

### Attachment & Inline Images Table

The same `post_chunks` table is used for both file attachments **and** inline images, distinguished by `chunk_index` sign:

```sql
CREATE TABLE IF NOT EXISTS post_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,           -- base64-encoded
  UNIQUE (post_id, chunk_index)
);

-- Chunk indexing convention:
-- chunk_index >= 0: file attachment chunks (0, 1, 2, ...)
-- chunk_index < 0: inline image chunks (-1 for first image, -2 for second, etc.)
```

**Why negative indices for inline images?**
- Prevents collision with file attachment indices (which are sequential 0, 1, 2...)
- Allows unlimited inline images (-1, -2, -3, ...)
- Keeps chunk storage separate from content row to avoid history bloat

Bootstrap behavior:

- creates both tables if missing
- creates indexes for `created_at`, `tags`, and `(post_id, chunk_index)`

### Metadata Storage

File attachment name and inline image metadata are stored together in the `attachment_name` column as a JSON string:

```json
{
  "file": "document.pdf",
  "inline_images": [
    {"id": "uuid-abc123", "name": "photo-1.jpg"},
    {"id": "uuid-def456", "name": "photo-2.jpg"}
  ]
}
```

Parsing logic in `parseAttachmentMetadata()` handles backward compatibility with plain string attachment names.

### Schema Initialization Caching (Production Optimization)

On Vercel and other serverless platforms, a Lambda instance may execute many requests. The schema creation code (`ensurePostgresSchema`) runs only once per instance:

```typescript
let pgSchemaInitPromise: Promise<{ postsTable: string; chunksTable: string }> | null = null;

async function ensurePostgresSchema(host?: string | null) {
  if (pgSchemaInitPromise) return pgSchemaInitPromise; // Reuse cached result
  
  pgSchemaInitPromise = (async () => {
    // CREATE TABLE IF NOT EXISTS... (lines omitted)
    // CREATE INDEX... (lines omitted)
    return { postsTable, chunksTable };
  })();
  
  // Clear cache on error so next request retries
  pgSchemaInitPromise.catch(() => { pgSchemaInitPromise = null; });
  
  return pgSchemaInitPromise;
}
```

This reduces Lambda execution time and avoids timeouts from repeated schema operations.

## API Body Parser Limits

- `/api/blogs` (Mongo): 4.5 MB (whole post incl. base64 inline images; the editor blocks saves above ~4.4 MB)
- `/api/pg_blogs` (Postgres main): 4.5 MB
- `/api/pg_blogs/chunks` (chunk upload): 4 MB (each 2 MB binary chunk becomes ~2.67 MB base64)

## Error Handling & Observability

### Postgres Database Errors

When database operations fail on the Postgres `/blog/pg` list page (`src/app/blog/pg/page.tsx`):

1. **UI Error Banner**: A red error banner displays the error message with a "Retry" link instead of silently showing "No posts found".
2. **Server Logs**: `console.error()` is called with the error message so it appears in Vercel function logs.
3. **Schema Cache Recovery**: If `ensurePostgresSchema()` fails (line 1 of Lambda), `pgSchemaInitPromise` is cleared (reset to `null`) so the next request retries the schema check.

### Chunk Upload Error Logging

The `/api/pg_blogs/chunks` endpoint logs chunk upload failures with full stack traces to both console and stderr:

```typescript
console.error('[chunks] uploadPgChunk failed:', error?.message, error?.stack);
```

This enables quick root-cause diagnosis in Vercel function logs when large file uploads time out or when database writes fail mid-upload.

### Environment Variables

- `MONGODB_URI`: required whenever a runtime profile uses MongoDB.
- `POSTGRES_URL`: required whenever a runtime profile uses Postgres.

If a profile uses JSON mode, the corresponding database environment variable is not required for that path.