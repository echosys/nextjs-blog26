# 20260406 - JSON Storage Separation & Route Isolation Fix

## Issue Identified

After initial storage adapter implementation, discovered critical issue: **Mongo and Postgres blog routes were sharing the same local JSON file** (`config/localBlogData.json`), causing:

1. **Post Duplication**: Posts created in Mongo blog appeared in Postgres blog (and vice versa)
2. **Tag Contamination**: Each route showed combined tag lists from all posts
3. **Behavior Mismatch**: Local JSON mode didn't match production behavior where posts are route-isolated
4. **Inconsistent Routing Logic**: No backend-specific logic should exist; storage layer should handle all differences

## Root Cause

`readJsonBlogs()` and `writeJsonBlogs()` functions called a single JSON file path. Both Mongo and Postgres functions used the same file even after API routing diverged.

## What Changed

### 1. Config Structure (config/config.json)
- **Before**: `json.blogFile: "config/localBlogData.json"`
- **After**: 
  - `json.mongoBlogFile: "config/localBlogData_mongo.json"`
  - `json.postgresBlogFile: "config/localBlogData_postgres.json"`

### 2. Type Definition (src/lib/runtimeConfig.ts)
Updated `RuntimeConfig` type to reflect separate file paths:
```typescript
readonly json: {
  readonly loginFile: string;
  readonly mongoBlogFile: string;    // NEW
  readonly postgresBlogFile: string;  // NEW
};
```

### 3. Storage Functions (src/lib/storage.ts)
- Added `fileType: 'mongo' | 'postgres'` parameter to `readJsonBlogs()` and `writeJsonBlogs()`
- Each function now selects the appropriate file path based on fileType
- **Updated 16 call sites**:
  - Mongo functions: `getMongoTags()`, `listMongoBlogs()`, `getMongoBlogById()`, `createMongoBlog()`, `updateMongoBlog()`, `deleteMongoBlog()` → all pass `'mongo'`
  - Postgres functions: `listPgBlogs()`, `getPgBlogById()`, `createPgBlog()`, `updatePgBlog()`, `deletePgBlog()`, `uploadPgChunk()`, `getPgAttachment()` → all pass `'postgres'`

### 4. Status Endpoints (src/lib/storage.ts)
Fixed `getPostgresStatus()` to return `json.postgresBlogFile` instead of non-existent `json.blogFile`

### 5. Local Storage Files
- Created `config/localBlogData_mongo.json` (seed: empty posts array)
- Created `config/localBlogData_postgres.json` (seed: empty posts array)
- Original `config/localBlogData.json` can be removed or archived

## Verification (Tested on localhost)

### Status Endpoints
✓ `/api/status` → Shows `"label": "JSON file"` with `host: "config/user.json"`
✓ `/api/pg_status` → Shows `"label": "JSON file"` with `host: "config/localBlogData_postgres.json"`

### Post Isolation
✓ Created "Mongo Test Post" in Mongo route → appears ONLY in `/api/blogs` (1 post)
✓ Created "Postgres Test Post" in Postgres route → appears ONLY in `/api/pg_blogs` (1 post)
✓ `/api/blogs` returns 1 post (Mongo)
✓ `/api/pg_blogs` returns 1 post (Postgres)

### Tag Isolation
✓ `/api/tags` → `["mongo", "test"]` (Mongo tags only)
✓ `/api/pg_blogs` → `tags: ["postgres", "test"]` (Postgres tags only)

### Tag Filtering
✓ `/api/blogs?tag=test` → Returns Mongo post (1 matching)
✓ `/api/pg_blogs?tag=test` → Returns Postgres post (1 matching)
✓ Filtering logic now works consistently across backends

### File Storage
✓ `config/localBlogData_mongo.json` contains only Mongo post
✓ `config/localBlogData_postgres.json` contains only Postgres post
✓ Files are completely isolated

## Design Principle Restored

✅ **No backend-specific branching logic** - Each function has:
  - Single shared code path for JSON mode
  - Single shared code path for Mongo/Postgres mode
  - Difference is only which file/database is used (selected by fileType parameter)

This ensures local JSON mode behavior exactly matches production behavior: posts are isolated by route/backend type.

## Build & Test Results

- ✅ `npm run build` - Clean production build
- ✅ `npm test -- --runInBand` - All 5 tests pass, no regressions
- ✅ Manual API testing - All endpoints return correct isolated data
- ✅ No type errors

## Why This Approach Is Better

1. **Preserves Consistency**: Local and production now have identical isolation behavior
2. **Supports Testing**: Can test Mongo-specific and Postgres-specific logic independently
3. **Follows User Intent**: UI shows separate Mongo and Postgres tabs for separate data
4. **Simpler Adapter**: No special cases needed; adapter simply branches on backend mode, not on file selection

## Notes

- Status footer labels already showed correct "JSON file" designation; no changes needed there
- All adapter functions remain unchanged in signature; only internal implementation uses fileType parameter
- Local files can be used in any config combination (e.g., Mongo=Postgres=JSON locally, then switch one to real Mongo for testing)
