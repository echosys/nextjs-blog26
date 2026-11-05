# MongoDB Database Setup — `dba_mongo.md`

Database: MongoDB Atlas (or local MongoDB)  
Database name: `blog_2026`  
Used by: login/auth, `/mongo` blog section, all `/api/blogs*` and `/api/login` routes

---

## 1. Connection

```bash
# Connect with mongosh
mongosh "$MONGODB_URI"

# Or explicitly
mongosh "mongodb+srv://<user>:<[REDACTED_SQL_PASSWORD_2]word>@<cluster>.mongodb.net/blog_2026"
```

Switch to the app database:

```js
use blog_2026
```

---

## 2. Collections Overview

MongoDB is schemaless — no `CREATE TABLE` needed. Collections are created automatically on first insert.  
The app uses **two collections**:

| Collection | Purpose |
|---|---|
| `blog_login` | Stores user credentials AND the master tag list |
| `blog_entry` | Stores all blog posts |

---

## 3. Create the Login User

This is **required** before you can log in to the app.  
The app looks up `blog_login` by `{ login }` and compares `pw` in the app.

```js
use blog_2026

db.blog_login.insertOne({
    login: "admin",
    pw: "your_secure_[REDACTED_SQL_PASSWORD_2]word_here",
    tags: []
})
```

> ⚠️ Passwords are stored **plain text** in this template. For production, hash with bcrypt.  
> The `tags` array is maintained automatically by the app — start it as `[]`.

---

## 4. Verify Login Document

```js
use blog_2026

// Should return your user document
db.blog_login.findOne({ login: "admin" })

// Should show: { _id: ..., login: "admin", pw: "...", tags: [] }
```

---

## 5. Create Indexes

MongoDB creates `_id` index automatically. Add these for performance:

```js
use blog_2026

// Index on tags array (multikey index) for fast tag filtering
db.blog_entry.createIndex({ tags: 1 })

// Index on createdAt for fast date sorting
db.blog_entry.createIndex({ createdAt: -1 })

// Text index on title + content for potential future search
db.blog_entry.createIndex(
    { title: "text", content: "text" },
    { name: "post_text_search" }
)
```

---

## 6. Insert a Test Blog Post

```js
use blog_2026

db.blog_entry.insertOne({
    title: "Hello MongoDB",
    content: "This is a test post from the Mongo blog.",
    tags: ["test", "mongodb"],
    attachment: null,
    attachmentName: null,
    createdAt: new Date()
})

// Also add those tags to the master list
db.blog_login.updateOne(
    { login: "admin" },
    { $addToSet: { tags: { $each: ["test", "mongodb"] } } }
)
```

---

## 7. Verify Setup

```js
use blog_2026

// List all collections
show collections
// Expected: blog_login, blog_entry

// Check user exists
db.blog_login.find().pretty()

// Check posts
db.blog_entry.find().sort({ createdAt: -1 }).pretty()

// Count posts
db.blog_entry.countDocuments()

// View master tag list
db.blog_login.findOne({}, { tags: 1, _id: 0 })

// List all indexes
db.blog_entry.getIndexes()
```

---

## 8. Common Queries Used by the App

```js
// GET /api/blogs — list posts (paginated, newest first)
db.blog_entry.find({})
    .sort({ createdAt: -1 })
    .skip(0)
    .limit(15)

// GET /api/blogs?tag=tech — filter by tag
db.blog_entry.find({ tags: "tech" })
    .sort({ createdAt: -1 })

// GET /api/tags — master tag list
db.blog_login.findOne({}, { tags: 1, _id: 0 })

// POST /api/blogs — create post
db.blog_entry.insertOne({
    title: "...",
    content: "...",
    tags: ["tag1", "tag2"],
    attachment: "<base64string_or_null>",
    attachmentName: "file.pdf",
    createdAt: new Date()
})

// After create — add new tags to master list
db.blog_login.updateOne(
    {},
    { $addToSet: { tags: { $each: ["tag1", "tag2"] } } }
)

// PUT /api/blogs — update post
db.blog_entry.updateOne(
    { _id: ObjectId("...") },
    { $set: {
        title: "Updated title",
        content: "Updated content",
        tags: ["newtag"],
        attachment: null,
        attachmentName: null,
        updatedAt: new Date()
    }}
)

// DELETE /api/blogs?id=... — delete post
db.blog_entry.deleteOne({ _id: ObjectId("...") })

// After delete — clean up tags no longer used by any post
// (the app does this automatically, but manual version:)
db.blog_entry.distinct("tags")  // get all tags still in use
db.blog_login.updateOne(
    {},
    { $pull: { tags: "orphaned_tag" } }
)

// POST /api/login — look up the user, then the app compares pw
db.blog_login.findOne({ login: "admin" })
```

---

## 9. Full Reset (Drop Everything)

> ⚠️ Destructive — deletes all data and users.

```js
use blog_2026

db.blog_entry.drop()
db.blog_login.drop()

// Then re-run Section 3 to recreate the login user
```

---

## 10. Atlas Setup (if using MongoDB Atlas)

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Database Access** → Add a database user with read/write access to `blog_2026`
3. **Network Access** → Add `0.0.0.0/0` (allow all IPs) for Vercel deployment, or add Vercel's IP ranges
4. **Connect** → "Connect your application" → copy the connection string
5. Replace `<[REDACTED_SQL_PASSWORD_2]word>` in the URI with your actual [REDACTED_SQL_PASSWORD_2]word
6. Add to Vercel env vars as `MONGODB_URI`

**Connection string format:**
```
mongodb+srv://<username>:<[REDACTED_SQL_PASSWORD_2]word>@<cluster>.mongodb.net/blog_2026?retryWrites=true&w=majority
```

---

## 11. Environment Variable

```env
MONGODB_URI=mongodb+srv://<user>:<[REDACTED_SQL_PASSWORD_2]word>@<cluster>.mongodb.net/blog_2026?retryWrites=true&w=majority
```

---

## 12. Schema Summary (Document Shape)

### `blog_login` document

```json
{
    "_id": ObjectId("..."),
    "login": "admin",
    "pw": "your_[REDACTED_SQL_PASSWORD_2]word",
    "tags": ["tech", "news", "personal"]
}
```

> One document per user. The `tags` array is the **master tag list** shared across all posts.

### `blog_entry` document

```json
{
    "_id": ObjectId("..."),
    "title": "Post Title",
    "content": "Post body text...",
    "tags": ["tech", "news"],
    "attachment": "data:application/pdf;base64,JVBERi0x...",
    "attachmentName": "report.pdf",
    "createdAt": ISODate("2026-03-09T12:00:00Z"),
    "updatedAt": ISODate("2026-03-09T14:00:00Z")
}
```

> `attachment` is the **full base64 data URI** of the file (suitable for small files).  
> `attachmentName` is the original filename shown in the UI download link.  
> `updatedAt` is set on PUT, absent on first insert.

