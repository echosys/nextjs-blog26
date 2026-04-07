# Local Runtime Guide

Local execution is intended for `npm run dev` on localhost.

## Default Local Storage

The current `config/config.json` uses:

- `local.loginMode = json`
- `local.mongoBlogMode = json`
- `local.postgresBlogMode = json`

This means you can run the app locally without MongoDB or Postgres.

## Local Files

- login source: `config/user.json`
- blog source: `config/localBlogData.json`

## Switching Local Storage

If you want to test real databases locally, change the `local` section in `config/config.json`.

- set `local.loginMode` to `mongo` to use Mongo auth locally
- set `local.mongoBlogMode` to `mongo` to use Mongo blog storage locally
- set `local.postgresBlogMode` to `postgres` to use Postgres blog storage locally

When you switch to database-backed local modes, the adapter will create missing collections or tables automatically.