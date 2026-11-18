# Postgres Database Setup — `dba_postgres.md`

Database: PostgreSQL (Neon / Supabase / self-hosted)  
Used by: `/blog/pg` blog section, all `/api/pg_blogs*` routes

---

## 1. Connection

Connect with your Postgres client:

```bash
# Using psql CLI
psql "$POSTGRES_URL"

# Or with explicit params
psql -h <host> -U <user> -d <dbname> -p 5432
```

For **Neon**: use the connection string from the Neon dashboard (`Settings → Connection Details`).  
For **Supabase**: use `Settings → Database → Connection string → URI`.

---

## 2. Create Tables

Run these in order. Copy-paste the entire block into psql or your SQL client.

### `posts` table

```sql
CREATE TABLE IF NOT EXISTS posts (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    tags            TEXT[]          DEFAULT '{}',
    attachment_name TEXT            DEFAULT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NULL
);
```

### `post_chunks` table

Stores large file attachments as ordered base64 chunks (2MB each).  
Allows files up to ~200MB while staying within Vercel's 4.5MB request limit per chunk.

```sql
CREATE TABLE IF NOT EXISTS post_chunks (
    id          SERIAL PRIMARY KEY,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    data        TEXT    NOT NULL,
    UNIQUE (post_id, chunk_index)
);
```

> The `ON DELETE CASCADE` on `post_chunks` means deleting a post automatically deletes all its chunks.

---

## 3. Indexes

```sql
-- Speed up tag filtering (GIN index on array column)
CREATE INDEX IF NOT EXISTS idx_posts_tags
    ON posts USING GIN (tags);

-- Speed up chunk retrieval in order
CREATE INDEX IF NOT EXISTS idx_post_chunks_post_id
    ON post_chunks (post_id, chunk_index);

-- Speed up listing by date
CREATE INDEX IF NOT EXISTS idx_posts_created_at
    ON posts (created_at DESC);
```

---

## 4. Insert a Test Post

```sql
INSERT INTO posts (title, content, tags, attachment_name)
VALUES (
    'Hello Postgres',
    'This is a test post from the Postgres blog.',
    ARRAY['test', 'postgres'],
    NULL
);
```

---

## 5. Verify Setup

```sql
-- List all tables
\dt

-- Check posts schema
\d posts

-- Check chunks schema
\d post_chunks

-- Count rows
SELECT COUNT(*) FROM posts;
SELECT COUNT(*) FROM post_chunks;

-- View posts with tag filter
SELECT id, title, tags, created_at
FROM posts
ORDER BY created_at DESC
LIMIT 10;

-- View all distinct tags
SELECT DISTINCT unnest(tags) AS tag
FROM posts
ORDER BY tag ASC;
```

---

## 6. Full Reset (Drop Everything)

> ⚠️ Destructive — deletes all data.

```sql
DROP TABLE IF EXISTS post_chunks CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
```

Then re-run Section 2 to recreate.

---

## 7. Common Queries Used by the App

```sql
-- List all posts (newest first)
SELECT id, title, content, attachment_name, tags, created_at
FROM posts
ORDER BY created_at DESC;

-- Filter by tag
SELECT id, title, content, attachment_name, tags, created_at
FROM posts
WHERE 'yourtag' = ANY(tags)
ORDER BY created_at DESC;

-- Get single post
SELECT * FROM posts WHERE id = 1;

-- Get all tags
SELECT DISTINCT unnest(tags) AS tag FROM posts ORDER BY tag ASC;

-- Delete post (chunks auto-deleted by CASCADE)
DELETE FROM posts WHERE id = 1;

-- Get attachment chunks in order
SELECT data FROM post_chunks
WHERE post_id = 1
ORDER BY chunk_index ASC;

-- Count chunks for a post
SELECT COUNT(*) FROM post_chunks WHERE post_id = 1;
```

---

## 8. Environment Variable

```env
POSTGRES_URL=postgresql://<user>:<[REDACTED_SQL_PASSWORD_2]word>@<host>/<dbname>?sslmode=require
```

**Neon example:**
```env
POSTGRES_URL=postgresql://neonuser:abc123@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Local Postgres (no SSL):**
```env
POSTGRES_URL=postgresql://postgres:[REDACTED_SQL_PASSWORD_2]@localhost:5432/blog_2026
```

---

## 9. Schema Summary

```
posts
├── id              SERIAL PK
├── title           TEXT NOT NULL
├── content         TEXT NOT NULL
├── tags            TEXT[]  (e.g. {tech,news})
├── attachment_name TEXT    (original filename, NULL if no attachment)
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

post_chunks
├── id              SERIAL PK
├── post_id         INTEGER FK → posts.id (CASCADE DELETE)
├── chunk_index     INTEGER (0-based ordering)
└── data            TEXT (base64 encoded chunk, ~2MB each)
```

