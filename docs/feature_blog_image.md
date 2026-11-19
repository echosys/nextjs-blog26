# Blog inline images and attachments

How pasted images and file attachments are handled in the blog editors (`/blog/mongo/*`, `/blog/pg/*`). Editor component: `src/components/ContentEditor.tsx`.

## Pasting an image

1. Paste an image into the editor (screenshot, copied image, or copied image file). Text pastes are inserted as plain text.
2. A "compressing…" placeholder appears at the cursor.
3. The image is processed in the browser:
   - **Already ≤ `inlineImageTargetKB`** (default 250 KB): kept byte-for-byte in its original format (PNG transparency preserved).
   - **Larger**: drawn onto a canvas with a white background (transparent areas would otherwise turn black in JPEG), scaled so the longest side is ≤ `inlineImageMaxDimensionPx` (default 1920 px), then encoded as JPEG at the highest quality (0.4–0.9) that fits the target. If it still doesn't fit at the lowest quality, the dimensions shrink by 15% steps (not below 320 px on the longest side).
4. The image is inserted as a 100 px thumbnail (`inlineThumbnailMaxPx`) that can be resized by dragging up to 400 px (`inlineThumbnailMaxResizePx`). The full compressed image is stored; thumbnail size is display-only.
5. The sidebar "Inline images" list shows each image with its size, a download button, and a remove button.

Paste as many images as you like; each is compressed independently (typically well under a second per image). Measured example: 13 MB 3000×2000 photo-like PNGs became ~247 KB 1920×1280 JPEGs.

All values above are in `config/config.json`.

## Saving: Mongo blog

- The whole post — HTML content with every inline image as a base64 data URL (+33% size), plus the file attachment — is sent in **one** request to `/api/blogs`.
- Vercel rejects request bodies over 4.5 MB (well before MongoDB's 16 MB document limit). The editor therefore checks the request size before sending and, above `maxSingleRequestBytes` (default 4,400,000 bytes), shows: *"This post is X MB, but one save can be at most Y MB. Remove some inline images or use a smaller attachment."* Nothing is sent in that case.
- Practical capacity at the default target: about **12 photo-like images** per post with no attachment (verified: 12 images saved in a 4.05 MB request; 15 were blocked by the size check). Screenshots of text/UI compress smaller, so more fit. An attachment shares the same budget.
- Lists and previews never download images or attachments in bulk: the list page sends only a text excerpt and the attachment size; the preview fetches the post body on open (`/api/blogs?id=…&attachment=0`); attachments download via `/api/blogs/download/[id]` (always `application/octet-stream`, forced download).

## Saving: Postgres blog

- Inline images are extracted from the HTML before saving: each `<img data-inline-id>` gets an empty `src` and a `data-inline-image-id` marker, and the post row stores small metadata JSON in `attachment_name` (`{ file, inline_images: [{ id, name, chunks: [index] }] }`).
- Each image is uploaded in **its own request** to `/api/pg_blogs/inline-images?id=&chunkIndex=` (body limit 4 MB) and stored as one row in `post_chunks`. Inline image chunk indices start at 1000 so they never collide with file-attachment chunks (0…N-1).
- File attachments are split into 2 MB chunks and uploaded one by one to `/api/pg_blogs/chunks` (files up to ~200 MB).
- Because every image is a separate request, there is **no practical limit on the number of inline images** per Postgres post; only each image must fit in one request, which compression guarantees.
- Viewing: the preview and editor fetch each image chunk in parallel and swap it back into the `src` placeholder. Downloads assemble attachment chunks server-side at `/api/pg_blogs/download/[id]`.

## Security

- Stored HTML is sanitized with DOMPurify before it is rendered in the preview or loaded into the editor (inline `style`, `data-*` attributes, and `data:` image URLs are kept; scripts, event handlers, `javascript:` URLs, and iframes are removed).
- Attachment downloads always use `Content-Disposition: attachment` with an encoded filename.

## Known limitations

- Animated GIFs larger than the target become a static JPEG (first frame).
- Pasting multiple images at once inserts only the first; paste them one after another.
- Postgres: if an inline image upload fails part-way, the post metadata may reference a chunk that was never stored (the image then shows as missing).
