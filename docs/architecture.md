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
- `src/lib/storage.ts`: shared adapter entrypoint for auth, Mongo-style blog CRUD, Postgres-style blog CRUD, tag lookup, status checks, attachment download, and chunk uploads.
- `src/lib/logger.ts`: appends runtime events to `logs/runtime.log`.
- `src/pages/api/*`: thin API routes that delegate to the storage layer.
- `src/app/mongo/page.tsx` and `src/app/pg/page.tsx`: server components that read through the same adapter layer as the APIs.
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