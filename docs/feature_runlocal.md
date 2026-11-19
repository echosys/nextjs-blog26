# Local Runtime Guide

Local execution is intended for `npm run dev` on localhost.

## Default Local Storage

The current `config/config.json` uses:

- `local.loginMode = json`
- `local.mongoBlogMode = json`
- `local.postgresBlogMode = json`
- `local.trackerMode = json`

This means you can run the app locally without MongoDB or Postgres. See `docs/run-local.md` for the full guide.

## Local Files

- login source: `config/user.json`
- Mongo blog: `config/localBlogData_mongo.json`
- Postgres blog: `config/localBlogData_postgres.json`
- tracker: `config/localTrackerData.json` (git-ignored)

## Switching Local Storage

If you want to test real databases locally, change the `local` section in `config/config.json`.

- set `local.loginMode` to `mongo` to use Mongo auth locally
- set `local.mongoBlogMode` to `mongo` to use Mongo blog storage locally
- set `local.postgresBlogMode` to `postgres` to use Postgres blog storage locally
- set `local.trackerMode` to `mongo` to use Mongo tracker storage locally

When you switch to database-backed local modes, the adapter will create missing collections or tables automatically.