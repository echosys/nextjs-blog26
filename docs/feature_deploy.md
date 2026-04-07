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

## Deployment Notes

- Mongo collections are created automatically if they do not exist.
- Postgres tables and indexes are created automatically if they do not exist.
- Runtime activity is logged to `logs/runtime.log`.
- The same UI routes continue to work; only the backing adapter changes.