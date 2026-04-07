# 20260406 Storage Adapter Runtime

## What changed

- Replaced hardcoded login, Mongo blog, and Postgres blog persistence with a config-driven adapter layer in `src/lib/storage.ts`.
- Added runtime profile resolution in `src/lib/runtimeConfig.ts` so localhost can use different backends than deployment.
- Fixed `config/user.json` to valid JSON and normalized the local blog seed file to `{ "posts": [] }`.
- Added create-if-missing bootstrap logic for Mongo collections and Postgres tables/indexes.
- Added runtime logging to `logs/runtime.log` through `src/lib/logger.ts`.
- Updated API routes and server-rendered blog pages to read through the adapter layer.
- Updated architecture, feature, local-run, deploy, and database docs.
- Fixed Mongo list filtering to treat `tag=all` as no-filter, matching PG behavior.
- Fixed PG JSON id lookup path to always use the PG JSON file in local JSON mode.
- Updated footer backend badges to resolve from runtime mode/config (shows JSON in local JSON mode).
- Added `docs/features.md` compatibility file expected by agent automation.

## Why it changed

- The app needed a cleaner way to test locally without always requiring live databases.
- Deployment still needs real database backends, but that should be selected by config instead of hardcoded route logic.
- Bootstrap behavior reduces setup friction when a collection or table has not been created yet.
- Mongo and PG routes must have identical filtering semantics regardless of backend mode.
- Local JSON mode should mirror deploy separation where Mongo and PG blog posts are isolated.
- Footer backend indicators should reflect active runtime config, not hardcoded DB assumptions.

## Assumptions

- Local runtime means localhost or non-production development execution.
- Mongo and PG local JSON blog files remain separate to mirror deploy behavior.
- Database credentials still come from environment variables even though backend selection now comes from `config/config.json`.