# Storage Reference

This app supports three storage backends behind one adapter layer: JSON files, MongoDB, and Postgres.

## Runtime Config

All runtime storage settings live in `config/config.json`.

```json
{
  "local": {
    "loginMode": "json",
    "mongoBlogMode": "json",
    "postgresBlogMode": "json"
  },
  "deploy": {
    "loginMode": "mongo",
    "mongoBlogMode": "mongo",
    "postgresBlogMode": "postgres"
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
  "json": {
    "loginFile": "config/user.json",
    "mongoBlogFile": "config/localBlogData_mongo.json",
    "postgresBlogFile": "config/localBlogData_postgres.json"
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

- `/api/blogs` (Mongo): 4.5 MB (accommodates 3 MB inline images + JSON envelope)
- `/api/pg_blogs` (Postgres main): 4.5 MB
- `/api/pg_blogs/chunks` (chunk upload): 4 MB (each 2 MB binary chunk becomes ~2.67 MB base64)

## Error Handling & Observability

### Postgres Database Errors

When database operations fail on the Postgres `/pg` list page (`src/app/pg/page.tsx`):

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