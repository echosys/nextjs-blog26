# App Shell

## Purpose

The multi-app frame around every page: header with top-bar tabs, footer with live database status, and the app navigator at `/`.

## Responsibilities

- Render the header tabs from the app registry (`Mongo Blog · Postgres Blog · Tracker · Settings`) plus Logout when signed in.
- Render the footer DB status dots (checked on page load; red after errors or a 15 s timeout) and build info.
- Show app cards on `/`.

## Owned Paths

- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/app/components/**` (`ActiveNavLink`, `DbStatusIndicator`, `LogoutButton`, `LocalTime`)
- `src/lib/apps.ts`

## Public Entry Points

- `GET /` — app navigator (login required).

## Key Files

- `src/lib/apps.ts` — `APPS` registry: `{ id, name, description, href, basePath, icon, nav[] }`. Each `nav` entry becomes a top-bar tab; `HUB_NAME`.
- `src/app/layout.tsx` — root layout, title template `%s · App Hub`.
- `src/app/components/ActiveNavLink.tsx` — active state by exact path or prefix.
- `src/app/components/DbStatusIndicator.tsx` — footer status check against `/api/status?scope=blog` and `/api/pg_status`.

## Dependencies

- `auth` (`verifySessionToken` decides whether tabs are shown).
- `storage` (`getRuntimeStorageConfig` for footer labels).

## Data Models

- None persisted.

## Invariants

- Adding an app = new route folder + one `APPS` entry; no other shell changes needed.
- Each app sets its own tab title via its `layout.tsx` metadata.

## Known Constraints

- Header tab count grows with apps; consider grouping if more than ~6 tabs.

## Related Tests

- None (verified via e2e screenshots).
