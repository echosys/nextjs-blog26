# 2026-04-29 — Inline Image Refactoring & Display/Chunk Fixes

## Session 1 — Initial Implementation
See previous entries for initial inline image chunking design.

## Session 2 — Bug Fixes

### Problem 1: `attachment_name` read back as raw JSON string
- `PgPostList.tsx` passed raw `post.attachment_name` (JSON string) directly as `attachmentName` to `PostPreview` and download links
- Showed raw JSON like `{"file":null,"inline_images":[...]}` in the UI
- **Fix**: Import `parseAttachmentMetadata` in `PgPostList.tsx` and extract `meta.file` for the download link and `meta.inline_images` for the preview

### Problem 2: `getPgAttachment` fetched inline image chunks in file download
- `SELECT ... WHERE post_id = $1 ORDER BY chunk_index ASC` included negative-index inline image chunks
- If post has inline images, their base64 data would be prepended to the file download stream
- **Fix**: Added `AND chunk_index >= 0` filter; also parse JSON attachment_name to return only `file` field

### Problem 3: `updatePgBlog` deleted inline image chunks when clearing/replacing attachment
- `DELETE FROM post_chunks WHERE post_id = $1` wiped ALL chunks
- **Fix**: Changed to `AND chunk_index >= 0` for both clear and replace cases

### Problem 4: `clear_attachment` hardcoded `null` for attachment_name
- When removing a file but keeping inline images, `attachment_name` was set to `null` losing inline image metadata
- **Fix**: Use `input.attachment_name` (which client now sets to JSON with `file:null` + preserved inline images)

### Problem 5: Inline images used positional index instead of explicit chunk index
- API used `?index=0,1,2` → storage computed `chunkIndex = -(index+1)`
- Fragile: order must be exactly consistent between save and load
- **Fix**: Inline image metadata now stores `chunkIndex` explicitly (e.g. `-1`, `-2`); API accepts `?chunkIndex=-1`; no implicit conversion needed

### Problem 6: `PostPreview` hook signature mismatch
- `usePgInlineImages(postId, inlineImageIds: string[])` now needs `InlineImageMetadata[]` (with chunkIndex)
- **Fix**: Updated to `usePgInlineImages(postId, inlineImageMeta: InlineImageMetadata[])`; fetches by chunkIndex

## Files Changed in Session 2

| File | Change |
|------|--------|
| `src/lib/inlineImages.ts` | Added `chunkIndex` to `InlineImageMetadata`; added `inlineChunkIndex()` helper; updated `extractInlineImages` to compute and return `chunkIndex` per image |
| `src/lib/useInlineImages.ts` | Rewrote `usePgInlineImages` to accept `InlineImageMetadata[]`; fetch by `chunkIndex`; updated `loadInlineImagesForEdit` signature |
| `src/pages/api/pg_blogs/inline-images.ts` | Changed from `?index=` (0-based) to `?chunkIndex=` (negative int); added validation for negative-only |
| `src/lib/storage.ts` | `uploadPgInlineImageChunk`/`getPgInlineImageChunk` now accept `chunkIndex` directly; `getPgAttachment` filters `chunk_index >= 0` + parses JSON name; `updatePgBlog` uses `input.attachment_name` instead of null for clear; chunk deletes filter `>= 0` |
| `src/app/pg/PgPostList.tsx` | Parse `attachment_name` JSON; use `meta.file` for download; pass `inlineImagesMeta` to `PostPreview` |
| `src/components/PostPreview.tsx` | Added `inlineImagesMeta` to Post interface; pass to `usePgInlineImages` |
| `src/app/pg/new/page.tsx` | Pass `img.chunkIndex` in metadata and API call |
| `src/app/pg/edit/[id]/page.tsx` | Pass `img.chunkIndex` in metadata and API call; fix `loadInlineImagesForEdit` call |
| `docs/schema.sql` | Updated with UNIQUE constraint, comments, and partial indexes for chunk_index |

## Chunk Index Convention (enforced in code)

| Range | Usage |
|-------|-------|
| `chunk_index >= 0` | File attachment chunks (0, 1, 2, …) assembled in order |
| `chunk_index < 0` | Inline image chunks (-1 = img[0], -2 = img[1], …) each a complete image |

The `attachment_name` column stores metadata JSON:
```json
{
  "file": "document.pdf",
  "inline_images": [
    {"id": "img-uuid1", "name": "photo.jpg", "chunkIndex": -1},
    {"id": "img-uuid2", "name": "chart.jpg", "chunkIndex": -2}
  ]
}
```


## Summary
Completed comprehensive refactoring of inline image handling for Postgres blog and fixed content display issues for both routes.

## Changes Made

### 1. Fixed Content Display Issue (Mongo & Postgres)
**Problem**: Content with newlines and whitespace was being collapsed into a single line when displayed.
**Solution**: Added `whitespace-pre-wrap` CSS class to the content div in `PostPreview.tsx`
**Files**:
- `src/components/PostPreview.tsx`: Added CSS whitespace preservation

### 2. Refactored Postgres Inline Image Storage
**Problem**: Inline images stored as base64 data URLs in content caused database history bloat with row versioning.
**Solution**: Implemented chunked storage for inline images, reusing existing post_chunks table with negative indices.

**Architecture**:
- **Content field**: Stores placeholder `<img data-inline-image-id="uuid" src=""/>` tags instead of base64
- **Chunks table**: Inline images use negative chunk_index (-1, -2, etc.); file attachments use positive (0, 1, 2...)
- **Metadata**: `attachment_name` stores JSON with file name and inline image metadata
- **Client-side**: Fetches chunks on demand and reconstructs data URLs

**Files Created**:
- `src/lib/inlineImages.ts`: Utility functions for extracting/reconstructing inline images
- `src/lib/useInlineImages.ts`: React hook and helper functions for fetching inline images from chunks
- `src/pages/api/pg_blogs/inline-images.ts`: New API endpoint for uploading/downloading inline image chunks

**Files Modified**:
- `src/lib/storage.ts`: Added functions for storing/retrieving inline image chunks
- `src/components/PostPreview.tsx`: Updated to fetch inline images and reconstruct content
- `src/app/pg/new/page.tsx`: Updated to extract and upload inline images separately
- `src/app/pg/edit/[id]/page.tsx`: Updated to extract and handle inline images during edit

### 3. Updated Documentation
**Files Modified**:
- `docs/features_postgres_blog.md`: Documented inline image chunking design and differences from MongoDB
- `docs/database.md`: Documented negative chunk_index convention and metadata JSON structure

## Technical Details

### Inline Image Chunking Flow

**Upload (Create/Edit)**:
1. User pastes image into editor (stored with `data-inline-id` attribute)
2. On submit, `extractInlineImages()` removes base64 data URLs, saves images to array
3. Post created with clean content (placeholder img tags only)
4. Each inline image sent to `/api/pg_blogs/inline-images?id=postId&index=imageIndex`
5. Image stored in `post_chunks` with `chunk_index = -(imageIndex + 1)`

**Download/Display**:
1. Content loaded with empty src attributes: `<img data-inline-image-id="uuid" src=""/>`
2. Client-side hook `usePgInlineImages()` fetches chunks from API
3. `reconstructInlineImages()` replaces src="" with fetched data URLs
4. Content rendered with fully populated image elements

### Database Schema Change

**Chunk Index Convention**:
- `chunk_index >= 0`: File attachment chunks (sequential from 0)
- `chunk_index < 0`: Inline image chunks (-1 for image 0, -2 for image 1, etc.)

No migration needed; leverages existing post_chunks table with composite unique key.

### Attachment Metadata JSON

```json
{
  "file": "document.pdf",
  "inline_images": [
    {"id": "uuid-1", "name": "photo-1.jpg"},
    {"id": "uuid-2", "name": "photo-2.jpg"}
  ]
}
```

Backward compatible: parsing treats plain strings as legacy file names.

## MongoDB vs Postgres (Now Documented)

| Feature | MongoDB | Postgres |
|---------|---------|----------|
| Inline Images | Base64 in content field | Chunks w/ negative indices |
| Storage Model | Single document | Separate content + chunks rows |
| History Bloat | High (full content on each edit) | Low (only chunks updated) |
| Request Size | Limited by 4.5 MB body parser | No practical limit (chunked) |
| DB Size Limit | 16 MB BSON per doc | No document size limit |

## Testing Checklist

- [ ] Create new Postgres post with inline images (verify chunks created)
- [ ] Edit Postgres post with inline images (verify rendering)
- [ ] Verify file attachments still work alongside inline images
- [ ] Verify Mongo posts display with whitespace preserved
- [ ] Verify Postgres posts display with whitespace preserved and inline images visible
- [ ] Test both local JSON and deployed database modes

## Notes

- Backward compatibility: Existing Postgres posts without inline images continue to work
- JSON mode: Inline images stored as base64 in content (no chunks)
- Performance: Hook fetches chunks in parallel; loading state handled gracefully
- All inline images can be displayed (no "first image only" limitation like file attachments)
