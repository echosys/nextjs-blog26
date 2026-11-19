# Run Locally

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Sign in with the local test user from `config/user.json` (`test` / `testpw`). After login you land on the app navigator (`/`).

## Storage in the local profile

Requests to `localhost`/`127.0.0.1` use the `local` section of `config/config.json`; by default everything runs on JSON files, so no database is needed:

| Feature | Mode key | Default | Local file |
| --- | --- | --- | --- |
| Login | `local.loginMode` | `json` | `config/user.json` |
| Mongo blog | `local.mongoBlogMode` | `json` | `config/localBlogData_mongo.json` |
| Postgres blog | `local.postgresBlogMode` | `json` | `config/localBlogData_postgres.json` |
| Tracker | `local.trackerMode` | `json` | `config/localTrackerData.json` (git-ignored; created with default categories on first use) |
| Ops log (keep-alive runs, login attempts) | `local.opsMode` | `json` | `config/localOpsData.json` (git-ignored; contains IPs) |

Switch any mode to `mongo` / `postgres` to use a real database locally (set `MONGODB_URI` / `POSTGRES_URL` in `.env.local`). Collections, tables, and indexes are created automatically.

Settings (`/settings`) shows mock schemas from `config/mockSchema.json` for any database the local profile doesn't use.

## Environment variables (`.env.local`)

- `MONGODB_URI`, `POSTGRES_URL` — only needed for non-JSON modes (the footer status and keep-alive will report placeholders as unreachable).
- `AUTH_SECRET` — optional locally (a dev-only key is used if nothing is set).

## Testing deploy behaviour locally

The runtime profile follows the `Host` header, so `deploy` mode can be exercised without deploying:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017 POSTGRES_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npx next start -p 3996
curl -H 'Host: hub.example.com' http://localhost:3996/api/keepalive
```

Throwaway databases: `docker run -d --rm -p 55432:5432 -e POSTGRES_PASSWORD=pw postgres:17-alpine` and `docker run -d --rm -p 57017:27017 mongo:8`.

## Logs

Local runtime logs (key actions and errors) are appended to `logs/runtime.log` as JSON lines.
