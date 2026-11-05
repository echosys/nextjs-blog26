# Deploy Runtime Guide

Deploy execution uses the `deploy` section of `config/config.json`.

## Default Deploy Storage

The current config uses:

- `deploy.loginMode = mongo`
- `deploy.mongoBlogMode = mongo`
- `deploy.postgresBlogMode = postgres`

## Required Environment Variables

- `MONGODB_URI` for deploy login and deploy Mongo blog mode
- `POSTGRES_URL` for deploy PG blog mode
- `AUTH_SECRET` (recommended) — long random string used to sign session cookies, e.g. `openssl rand -base64 32`. If unset, the DB connection string is used as the signing key; changing the key logs everyone out.

## Deployment Notes

- Mongo collections are created automatically if they do not exist.
- Postgres tables and indexes are created automatically if they do not exist.
- Runtime errors are written to the Vercel function logs (the filesystem is read-only there).
- The same UI routes continue to work; only the backing adapter changes.