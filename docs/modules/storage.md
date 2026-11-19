# Storage

## Purpose

Resolve which backend each feature uses (JSON file, MongoDB, Postgres) for the current runtime profile, and provide shared clients, adapters, and logging.

## Responsibilities

- Pick the `local` or `deploy` profile from the request host.
- Expose storage modes: `loginMode`, `mongoBlogMode`, `postgresBlogMode`, `trackerMode`, `opsMode`.
- Provide Mongo and Postgres clients with fail-fast timeouts and retry after failed connects.
- Implement login and blog persistence (`src/lib/storage.ts`) and shared JSON file helpers.
- Write runtime logs.

## Owned Paths

- `src/lib/runtimeConfig.ts`, `src/lib/storage.ts`, `src/lib/mongodb.ts`, `src/lib/pg.ts`, `src/lib/logger.ts`
- `config/config.json` (all configurable values)

## Public Entry Points

- None (library module).

## Key Files

- `src/lib/runtimeConfig.ts` — typed view of `config/config.json`; `getRuntimeStorageConfig(host)`, `isKeepAliveEnabled()`.
- `src/lib/storage.ts` — login + blog adapters; `readJsonDocument`/`writeJsonDocument` (paths scoped to `config/`).
- `src/lib/mongodb.ts` — cached `MongoClient` (`serverSelectionTimeoutMS: 5000`, failed connects not cached).
- `src/lib/pg.ts` — `pg` pool (`connectionTimeoutMillis: 5000`).
- `src/lib/logger.ts` — JSON lines to `logs/runtime.log` locally; errors to stdout on Vercel (read-only filesystem).

## Dependencies

- `mongodb`, `pg` packages; env `MONGODB_URI`, `POSTGRES_URL`.

## Data Models

- See `docs/database.md`.

## Invariants

- Localhost/127.0.0.1 hosts use the `local` profile; everything else uses `deploy`.
- All configurable values live in `config/config.json`.

## Known Constraints

- JSON mode rewrites whole files; not safe for concurrent writers.

## Related Tests

- Indirectly via `src/__tests__/tracker.test.ts` (pure logic only).
