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
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
```

### Attachment Table

```sql
CREATE TABLE IF NOT EXISTS post_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  UNIQUE (post_id, chunk_index)
);
```

Bootstrap behavior:

- creates both tables if missing
- creates indexes for `created_at`, `tags`, and `(post_id, chunk_index)`

## Required Environment Variables

- `MONGODB_URI`: required whenever a runtime profile uses MongoDB.
- `POSTGRES_URL`: required whenever a runtime profile uses Postgres.

If a profile uses JSON mode, the corresponding database environment variable is not required for that path.