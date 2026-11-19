# Auth

## Purpose

Protect every page and API behind a single login and return each browser tab to the page it was opening.

## Responsibilities

- Issue, verify, and clear an HMAC-signed session cookie.
- Redirect unauthenticated page requests to `/login?next=<path>`; return 401 for protected APIs.
- Validate login input and compare passwords in constant time.
- Record every login attempt (success or failure, IP, user agent) via `recordLoginAttempt` (settings-ops module).

## Owned Paths

- `src/lib/session.ts`, `src/lib/nextPath.ts`, `src/proxy.ts`
- `src/app/login/**`
- `src/pages/api/login.ts`, `src/pages/api/logout.ts`

## Public Entry Points

- `GET /login` — sign-in page (shows DB status; triggers the keep-alive read).
- `POST /api/login` `{ login, pw }` — sets `session` cookie (HttpOnly, SameSite=Strict, Secure on deploy, lifetime `auth.sessionMaxAgeDays` from `config/config.json`, default/max 400 days).
- `POST /api/logout` — clears the cookie.
- Public APIs (no session): `/api/login`, `/api/logout`, `/api/status`, `/api/pg_status`, `/api/keepalive`.

## Key Files

- `src/lib/session.ts` — Web Crypto HMAC token `payload.signature`; key = `AUTH_SECRET` ‖ `MONGODB_URI` ‖ `POSTGRES_URL`.
- `src/proxy.ts` — Next 16 proxy (formerly middleware): auth gate and `next=` handling.
- `src/lib/nextPath.ts` — `safeNextPath` rejects off-site, protocol-relative, `/login`, `/api/*`, and control-character targets.

## Dependencies

- `storage` (`authenticateUser` against `config/user.json` or the Mongo login collection).
- `settings-ops` (`recordLoginAttempt`, `clientIp` in `src/lib/opsLog.ts`).

## Data Models

- Session token payload `{ sub: login, exp }` (not stored server-side).

## Invariants

- Non-string credentials are rejected with 400 (blocks Mongo operator injection) and audited as `invalid-input`.
- Only same-origin relative paths are used for post-login redirects.
- Login attempts are audited with outcome `success`, `invalid-credentials`, `invalid-input`, or `error`; passwords are never stored.

## Known Constraints

- Passwords are stored in plain text (accepted for this personal/test setup).
- No server-side session revocation; changing the signing key logs everyone out.
- No rate limiting or lockout yet (the login-attempt log could drive one).

## Related Tests

- `src/__tests__/session.test.ts`, `src/__tests__/nextPath.test.ts`
