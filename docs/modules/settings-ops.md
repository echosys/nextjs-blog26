# Settings & Ops

## Purpose

Operational view of the hub: database keep-alive (with a log of every run), login-attempt audit, health checks, required environment variables, and schema overview with app ownership.

## Responsibilities

- Read one row from each configured database to keep free tiers from pausing (login-page visits + daily Vercel cron + Settings button), and record each run with its source.
- Record every login attempt (time, attempted username, outcome, IP, user agent) and list recent ones.
- Report backend health for the footer and login page.
- Show env-var status (set/missing only, never values).
- Show Mongo collections and Postgres tables, labelling which App Hub app uses each; show mock schemas when the current profile doesn't use that database.

## Owned Paths

- `src/app/settings/**` (`page.tsx`, `KeepAliveRunButton.tsx`)
- `src/lib/dbAdmin.ts`, `src/lib/opsLog.ts`
- `src/pages/api/keepalive.ts`, `src/pages/api/status.ts`, `src/pages/api/pg_status.ts`
- `config/mockSchema.json`, `vercel.json`

## Public Entry Points

- `GET /settings` (login required): keep-alive (last run, source, per-database result, previous runs), login activity table, env vars, schemas.
- `GET /api/keepalive?source=login-page|settings` (public, read-only on app data; appends one ops-log record; respects `keepAlive.enabled`). Requests with a `vercel-cron/*` user agent are recorded as `cron`; unknown or spoofed `source` values become `api`.
- `GET /api/status` (`?scope=blog` for the Mongo blog backend), `GET /api/pg_status` (public).
- `recordLoginAttempt` is called by `POST /api/login` (auth module).

## Key Files

- `src/lib/dbAdmin.ts` — `runKeepAlive`, `getMongoSchema` (field types computed in MongoDB via `$sample`/`$objectToArray`), `getPostgresSchema` (`information_schema`, `pg_class`, `pg_indexes`), `getSchemaOwners`, `getMockSchema`.
- `src/lib/opsLog.ts` — `recordKeepAliveRun`, `listKeepAliveRuns`, `recordLoginAttempt`, `listLoginAttempts`, `resolveKeepAliveSource`, `clientIp`. JSON (`opsMode: json`) or MongoDB (`opsMode: mongo`).
- `src/app/settings/page.tsx` — sections stream independently via `Suspense`; times rendered in the browser's timezone via `src/app/components/LocalTime.tsx`.

## Dependencies

- `storage` (`runtimeConfig`, clients, `readJsonDocument`/`writeJsonDocument`, logger).

## Data Models

- `config/mockSchema.json` — `{ mongo: { database, collections[] }, postgres: { schema, tables[] } }` matching the live schema shapes.
- Keep-alive run `{ at, source: cron|login-page|settings|api, results: [{ backend, configured, ok, ms?, message? }] }` → `ops.keepAliveRunsCollection`.
- Login attempt `{ at, login, success, outcome: success|invalid-credentials|invalid-input|error, ip, userAgent }` → `ops.loginAttemptsCollection`.

## Invariants

- Schema views never return document values or base64 data, only names, types, counts, and indexes.
- Owned names come from `config/config.json` (blog collections/tables, `tracker.*Collection`, `ops.*Collection`).
- Passwords are never written to the ops log.
- Recording never throws: a failed audit write is logged (`ops.keepalive` / `ops.login`) and the keep-alive or login still completes.
- Records expire after `ops.retentionDays` (Mongo TTL index on `at`; JSON mode trims on write).

## Known Constraints

- Mongo field types are sampled from up to 25 documents per collection.
- Postgres row counts are planner estimates (`reltuples`).
- If MongoDB itself is down, a keep-alive run can't be recorded there (the failure is still in the function log).
- IPs rely on the platform proxy's `x-forwarded-for` (trusted on Vercel; spoofable if self-hosted without a proxy).
- Footer status checks also touch the databases but are not recorded (they run on every page load).

## Related Tests

- `src/__tests__/opsLog.test.ts` — keep-alive source detection (cron UA, spoofed/unknown sources) and client IP parsing.
- Verified against a Docker MongoDB 8 in deploy mode (TTL indexes, records, Settings output).
