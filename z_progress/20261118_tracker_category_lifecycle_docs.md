# 2026-11-18 — Tracker category lifecycle, config-driven settings, module docs

## What changed

- **Tracker category lifecycle (append-only)**
  - Categories are never deleted. "Delete" sets `retiredOn`; "Restore" clears it.
  - Edit: goal-only changes update in place; renaming or changing type/unit retires the old category (`retiredOn`, `replacedBy`) and creates a new one with a fresh, never-reused key (`startedOn` = today).
  - `saveEntry` only replaces active-category values and keeps retired ones; the entries API validates against active categories only.
  - Journal shows retired values greyed and read-only; the category manager gained Edit (with an "in place" vs "new category" notice), Retire, and a Retired list with Restore.
  - Analytics hides retired categories by default; they can be included with a checkbox or picked from a "Retired" group in the dropdown. Days outside a category's lifetime are shaded and excluded from counts, rates, and streaks; retired categories have no current streak.
- **Defaults and demo data**: default categories are now Workout (min, goal 30), WFH, In Office, Chores (min), Study (units), Tasks (units). Local demo data regenerated with ~60 days of entries plus a retired "Reading" category replaced by "Study" to demonstrate the lifecycle.
- **Config**: `tracker.analyticsRangesDays`, `tracker.heatmapWeeks`, and top-level `maxSingleRequestBytes` moved from code into `config/config.json`.
- **Logging**: tracker category/entry/to-do mutations are logged (`tracker.category`, `tracker.entry`, `tracker.todo`).
- **Docs**: new `docs/module-index.yaml`, `docs/modules/{app-shell,auth,storage,blog,tracker,settings-ops}.md`, `docs/build.md`, `docs/run-local.md`, `docs/feature_tracker.md`, `docs/feature_blog_image.md`; updated architecture, features, database, run/deploy guides, mock schema.

## Why

- Renaming or retyping a category must not reinterpret old values (e.g. a boolean "Workout" becoming minutes), and deleting one must not lose journal history. Treating changes as "stop the old, start a new one" keeps analytics truthful.
- `agent.md` now requires module docs, a module index, build/run docs, config-only settings, logging, and daily progress files.

## Affected modules

- tracker (model, storage, API, Journal/Analytics views), blog (`requestSize` config), storage (`runtimeConfig` types, `config.json`), settings-ops (`mockSchema.json`).

## Verification

- `npx tsc --noEmit`, `npm test` (17 tests incl. new lifecycle tests), `next build` clean.
- API edge cases against the running server: goal edit in place; Chores → Housework keeps all 31 Chores days under the retired category; WFH boolean → amount creates `wfh-2`; delete retires; saving a day with values for retired keys ignores them and keeps stored ones; editing a retired category and duplicate active names are rejected; re-creating "Tasks" gets key `tasks-2`; restore is blocked while the name is active.
- Desktop screenshots: Journal shows retired values read-only and the "Save as new category" notice; Analytics hides retired by default, includes them on toggle, and shades out-of-lifetime days for a retired category.

## Assumptions

- "Today" for start/retire dates is the browser's local day (sent as `today`), falling back to the server's date.
- A category's lifetime starts at `startedOn` or its first recorded value, whichever is earlier (seeded defaults have no `startedOn`).
- Restoring a replaced category clears `replacedBy`; the replacement stays as a separate category.

## Follow-up

- Optional: show the replacement chain (old → new) side by side in Analytics.
- Optional: per-user ownership if the hub becomes multi-user.
- Blog: Postgres partial inline-image upload failures can leave dangling metadata.

---

# Later the same day — Keep-alive run log and login audit

## What changed

- New ops log (`src/lib/opsLog.ts`, `opsMode` json/mongo) with two MongoDB collections:
  - `ops_keepalive_runs`: `{ at, source: cron|login-page|settings|api, results[] }` written by every `/api/keepalive` call.
  - `ops_login_attempts`: `{ at, login, success, outcome, ip, userAgent }` written by every `POST /api/login` (no passwords).
  - Both have a TTL index on `at` (`ops.retentionDays`, default 90).
- Keep-alive source: Vercel cron detected via `vercel-cron/*` user agent; login page and Settings button send `?source=`; anything else (including a spoofed `source=cron`) is `api`.
- Settings: keep-alive section shows last run (local time + relative), its source, per-database results, last fully successful run, and previous runs; new "Login activity" table (time, result, user, IP, browser) with 24 h failure count.
- Config: `local/deploy.opsMode`, `ops.{keepAliveRunsCollection, loginAttemptsCollection, retentionDays, recentListLimit}`, `json.opsFile`. `config/localOpsData.json` is git-ignored. Mock schema and ownership labels include the new collections.

## Why

- "When was the database last kept alive, and by what?" needs a persisted record: Vercel function logs aren't queryable from the app and the local log file doesn't exist there.
- Login auditing (with IPs) makes brute-force attempts visible.

## Affected modules

- settings-ops (opsLog, keepalive API, Settings UI), auth (login API), storage (config/runtimeConfig), app-shell (`LocalTime` component).

## Verification

- `npm test` (20 tests incl. source detection and IP parsing), `tsc`, `next build`.
- Deploy mode against Docker MongoDB 8: four keep-alive sources recorded correctly (spoofed cron → `api`); four login attempts recorded with outcomes and first `x-forwarded-for` hop; TTL indexes `at_1` with 7,776,000 s; Settings shows last run/source and the login table; no password in stored docs or HTML.
- Local JSON mode records to `config/localOpsData.json`.

## Assumptions

- `x-forwarded-for` is trustworthy on Vercel; self-hosting without a proxy would allow spoofed IPs.
- Footer status checks are not recorded (they run on every page load); only explicit keep-alive calls are.

## Follow-up

- Optional: rate-limit / temporarily lock out IPs with many recent failed logins using `ops_login_attempts`.
- Optional: alert when the last successful keep-alive is older than N days.

---

# Later the same day — Session lifetime moved to config

- `SESSION_MAX_AGE_SECONDS` was hard-coded (400 days) in `src/lib/session.ts`; it now comes from `config/config.json` → `auth.sessionMaxAgeDays` (default 400), clamped to 1–400 days because browsers cap cookie lifetime at 400 days.
- Affects the cookie `Max-Age` and the signed token's `exp`. Existing sessions keep the expiry they were issued with.
- Affected modules: auth, storage (runtimeConfig). Docs: architecture, features, modules/auth. Tests: session expiry test now derives from the configured value.
