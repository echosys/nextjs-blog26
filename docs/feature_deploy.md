# Deploy Runtime Guide

Deploy execution uses the `deploy` section of `config/config.json`.

## Default Deploy Storage

The current config uses:

- `deploy.loginMode = mongo`
- `deploy.mongoBlogMode = mongo`
- `deploy.postgresBlogMode = postgres`
- `deploy.trackerMode = mongo`
- `deploy.opsMode = mongo` (keep-alive run log and login-attempt audit)

## Required Environment Variables

- `MONGODB_URI` for deploy login, deploy Mongo blog mode, and the Tracker
- `POSTGRES_URL` for deploy PG blog mode
- `AUTH_SECRET` (recommended) — long random string used to sign session cookies, e.g. `openssl rand -base64 32`. If unset, the DB connection string is used as the signing key; changing the key logs everyone out.

## Deployment Notes

- Mongo collections are created automatically if they do not exist (including `tracker_*` collections, their indexes, and default categories, and the `ops_*` collections with 90-day TTL indexes).
- Postgres tables and indexes are created automatically if they do not exist.
- Runtime errors are written to the Vercel function logs (the filesystem is read-only there).
- The same UI routes continue to work; only the backing adapter changes.