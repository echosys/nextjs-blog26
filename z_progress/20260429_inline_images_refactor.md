# 2026-04-29 — Inline Image Refactoring & Display Fixes

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
