# Blog Manager — Feature Guide

A dual-backend blog management app built with **Next.js 14 App Router**, backed by **MongoDB** (auth + blog) and **PostgreSQL** (blog).  
Both backends share the same modern dark UI styled after the jekyll-netlify-cms design system.

---

## Quick Start

### Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables (copy and fill in real values)
cp .env.local .env.local.bak   # already exists with mock values
# Edit .env.local with your real credentials (see below)

# 3. Run dev server
npm run dev

# 4. Open browser
open http://localhost:3000
```

> **Login** uses MongoDB. You must have a user document in the `blog_login` collection (see `z_md/dba_mongo.md`).

---

### Deploy to Vercel

```bash
# Push to GitHub, then connect repo in Vercel dashboard
# Or deploy directly:
npx vercel --prod
```

**Required Environment Variables in Vercel Dashboard** (`Settings → Environment Variables`):

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster0.abc.mongodb.net/blog_2026?retryWrites=true&w=majority` |
| `POSTGRES_URL` | Postgres connection string (Neon / Supabase / other) | `postgresql://user:pass@db.neon.tech/neondb?sslmode=require` |
| `NEXT_PUBLIC_BASE_URL` | Your Vercel deployment URL | `https://your-app.vercel.app` |

> `NEXT_PUBLIC_BUILD_TIME` and `NEXT_PUBLIC_GIT_COMMIT` are auto-set by `next.config.js` at build time — no need to add them manually.

---

## Architecture

```
nextjs-netlify-blog-template/
├── src/
│   ├── app/                        ← App Router (all UI)
│   │   ├── layout.tsx              ← Root layout: header, nav tabs, footer
│   │   ├── page.tsx                ← Root redirect (→ /login or /mongo)
│   │   ├── globals.css             ← Tailwind base + Inter font
│   │   ├── components/
│   │   │   ├── ActiveNavLink.tsx   ← Tab nav with active highlight
│   │   │   └── LogoutButton.tsx    ← Clears auth cookie, redirects to /login
│   │   ├── login/
│   │   │   ├── page.tsx            ← Login page shell
│   │   │   └── LoginForm.tsx       ← Form + dual DB status indicators
│   │   ├── mongo/                  ← MongoDB blog section
│   │   │   ├── page.tsx            ← Post list (server component, direct DB)
│   │   │   ├── MongoDeleteButton.tsx ← Client delete with confirm
│   │   │   ├── new/page.tsx        ← Create post form
│   │   │   └── edit/[id]/page.tsx  ← Edit post form
│   │   ├── pg/                     ← Postgres blog section
│   │   │   ├── page.tsx            ← Post list (server component, direct DB)
│   │   │   ├── PgPostList.tsx      ← Client-side list management & preview logic
│   │   │   ├── PgDeleteButton.tsx  ← Client delete with confirm
│   │   │   ├── new/page.tsx        ← Create post form (chunked upload)
│   │   │   └── edit/[id]/page.tsx  ← Edit post form (chunked upload)
│   ├── components/                 ← Shared UI components
│   │   ├── PostPreview.tsx         ← Modal for full blog content view
│   ├── pages/
│   │   ├── _app.tsx                ← Pages Router wrapper (API only)
│   │   └── api/                    ← All backend API routes
│   │       ├── login.ts            ← POST /api/login (MongoDB auth)
│   │       ├── blogs.ts            ← CRUD /api/blogs (MongoDB posts)
│   │       ├── tags.ts             ← GET /api/tags (MongoDB tag list)
│   │       ├── status.ts           ← GET /api/status (MongoDB health)
│   │       ├── pg_blogs.ts         ← CRUD /api/pg_blogs (Postgres posts)
│   │       ├── pg_blogs/
│   │       │   ├── chunks.ts       ← POST /api/pg_blogs/chunks (attachment chunk upload)
│   │       │   └── download/[id].ts← GET /api/pg_blogs/download/[id]
│   │       └── pg_status.ts        ← GET /api/pg_status (Postgres health)
│   ├── lib/
│   │   ├── mongodb.ts              ← MongoDB client (singleton, safe for Vercel)
│   │   ├── pg.ts                   ← Postgres pool (singleton, lazy-init)
│   │   └── dbConnect.ts            ← Mongoose connect (used by /api/status)
│   └── middleware.ts               ← Auth guard: redirects unauthenticated to /login
└── z_md/
    ├── feature.md                  ← This file
    ├── dba_postgres.md             ← Postgres DB setup SQL
    └── dba_mongo.md                ← MongoDB setup commands
```

---

## Features

### Authentication
- **Login page** (`/login`) — username + password form, validated against MongoDB `blog_login` collection
- **Cookie-based session** — `auth=true` cookie, 24-hour expiry, `SameSite=Strict`
- **Middleware auth guard** — all routes except `/login` and `/api/*` require the cookie; redirects to `/login` if missing
- **Logout button** — clears cookie, redirects to `/login`, visible in header after login
- **Dual DB status panel** on login page — live ping of both MongoDB and Postgres with animated indicators and hostname display
- Login button is **disabled** if MongoDB is unreachable; warning shown if only Postgres is down

### Navigation
- **Top header** always visible after login with app title and tab switcher
- **Active tab highlighting** — "Mongo Blog" / "Postgres Blog" tabs highlight the current section with teal colour
- Responsive layout, wraps on small screens

### MongoDB Blog (`/mongo`)
- **List view** — all posts sorted by newest first, server-rendered (no client fetch)
- **Sidebar tag filter** — click any tag to filter posts; "All Posts" to reset
- **Tag auto-management** — tags added to `blog_login.tags` on post create/update; removed automatically when no posts use them
- **Create post** (`/mongo/new`) — title, content, comma-separated tags, optional file attachment (base64, stored inline in MongoDB)
- **Edit post** (`/mongo/edit/[id]`) — pre-filled form, can replace or remove attachment
- **Delete post** — hover to reveal delete button, click requires confirm (Yes/No) before deleting
- **Attachment download** — download link shown on card if post has an attachment
- **Success banner** — teal banner after save/create, dismissable with X

### Postgres Blog (`/pg`)
- **Identical UI** to Mongo Blog — same card layout, tag sidebar, success banner
- **Chunked file upload** — large attachments (up to 200MB) split into 2MB base64 chunks stored in `post_chunks` table, bypassing Vercel's 4.5MB request limit
- **Upload progress bar** — animated gradient progress bar with MB counter and percentage during upload
- **Create post** (`/pg/new`) — same form as Mongo, with chunked upload logic
- **Edit post** (`/pg/edit/[id]`) — pre-filled, supports replacing or removing attachment with chunk cleanup
- **Delete post** — cascades deletes chunks from `post_chunks` table
- **Attachment download** (`/api/pg_blogs/download/[id]`) — reassembles chunks server-side, streams as binary download

### Shared UI Design
- **Dark theme** — `bg-slate-950` background, `text-slate-100` text throughout
- **Gradient title** — teal-to-blue gradient on "Blog Manager" heading
- **Card layout** — `bg-slate-900/50` cards with `border-slate-800`, hover border lift
- **Hover-reveal actions** — edit/delete buttons appear on card hover (opacity transition)
- **Tag badges** — small uppercase monospace tags on each card
- **Teal accent** — buttons, active states, links, progress bars all use `teal-500`
- **Rose danger** — delete confirm, logout hover, error states use `rose-400/500`
- **Build/commit footer** — shows `NEXT_PUBLIC_BUILD_TIME` and `NEXT_PUBLIC_GIT_COMMIT` at bottom of every page
- **Database Status in Footer** — dynamic indicators for MongoDB and PostgreSQL connectivity with partial hostnames for identification.

### Blog Post Preview
- **Interactive Preview Pane** — accessible by clicking any post card (not the edit button).
- **Full Content Rendering** — displays the entire post with proper whitespace preservation.
- **Keyboard Navigation** — move between posts using **Left/Right arrows** and close with **Escape**.
- **UI Controls** — dedicated next/previous buttons and a close (X) button.
- **Quick Edit** — an "Edit Post" button within the preview leads directly to the post's edit page.
- **Responsive Design** — adjusts for mobile with bottom navigation controls.

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Authenticate user against MongoDB `blog_login` collection. Sets `auth` cookie. |
| `GET` | `/api/status` | Check MongoDB connectivity (mongoose `readyState`). Returns `{ status: 'ok' }`. |
| `GET` | `/api/pg_status` | Check Postgres connectivity (`SELECT 1`). Returns `{ status, host }`. |
| `GET` | `/api/blogs` | List MongoDB posts. Query params: `page`, `limit`, `tag`. |
| `POST` | `/api/blogs` | Create MongoDB post. Body: `{ title, content, tags, attachment, attachmentName }`. |
| `PUT` | `/api/blogs` | Update MongoDB post. Body: `{ id, title, content, tags, attachment, attachmentName }`. |
| `DELETE` | `/api/blogs?id=` | Delete MongoDB post. Cleans up orphaned tags. |
| `GET` | `/api/tags` | List all tags from MongoDB `blog_login.tags` array. |
| `GET` | `/api/pg_blogs` | List Postgres posts. Query params: `tag`. Returns `{ posts, tags }`. |
| `GET` | `/api/pg_blogs?id=` | Get single Postgres post by ID. |
| `POST` | `/api/pg_blogs` | Create Postgres post (metadata only, no attachment data). Returns `{ id }`. |
| `PUT` | `/api/pg_blogs` | Update Postgres post metadata and optionally clear attachment. |
| `DELETE` | `/api/pg_blogs?id=` | Delete Postgres post + all chunks. |
| `POST` | `/api/pg_blogs/chunks?id=&index=` | Upload one base64 chunk for a Postgres post attachment. |
| `GET` | `/api/pg_blogs/download/[id]` | Reassemble chunks and stream attachment as binary download. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router + Pages Router API) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| Icons | Lucide React |
| MongoDB client | `mongodb` (native driver, singleton pattern) |
| Postgres client | `pg` (node-postgres, pool singleton) |
| Auth | Cookie-based (`auth=true`), enforced by Next.js middleware |
| Deployment | Vercel (serverless functions for API routes) |

---

## Local `.env.local` Template

```env
# MongoDB — required for login and Mongo Blog
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/blog_2026?retryWrites=true&w=majority

# Postgres — required for Postgres Blog
POSTGRES_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require

# Base URL — used for server-side API calls
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

> Replace `<user>`, `<password>`, `<cluster>`, `<host>`, `<dbname>` with your real values.  
> For local Postgres (no SSL): remove `?sslmode=require`.

