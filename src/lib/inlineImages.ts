/**
 * Inline image utilities for Postgres blog
 *
 * Storage design:
 *   - post_chunks table has (post_id, chunk_index, data) with UNIQUE(post_id, chunk_index)
 *   - chunk_index values are sequential non-negative integers (0, 1, 2, …) for ALL chunks of a post
 *   - attachment_name column stores JSON that records exactly which chunk indices belong to each item:
 *
 *     {
 *       "file": { "name": "doc.pdf", "chunks": [0, 1, 2] },   // file attachment chunks in order
 *       "inline_images": [
 *         { "id": "uuid1", "name": "photo.jpg", "chunks": [3] },  // one chunk per inline image
 *         { "id": "uuid2", "name": "chart.jpg", "chunks": [4] }
 *       ]
 *     }
 *
 *   - Chunk index assignment (callers are responsible):
 *       • File attachment:  indices 0 … F-1  (F = Math.ceil(fileSize / 2 MB))
 *       • Inline image i :  index F + i
 */

export type FileAttachmentMeta = {
  name: string;
  chunks: number[];  // chunk indices belonging to this file, in assembly order
  size?: number;     // original file size in bytes
};

export type InlineImageMeta = {
  id: string;        // matches data-inline-id / data-inline-image-id DOM attribute
  name: string;
  chunks: number[];  // chunk indices (single element for a single compressed image)
};

export type AttachmentMetadata = {
  file?: FileAttachmentMeta | null;
  inline_images?: InlineImageMeta[];
};

/**
 * Extract inline images from HTML content.
 * Returns cleanContent (img src replaced with empty placeholder + attribute renamed
 * to data-inline-image-id) and the list of images to be chunked.
 * Chunk index assignment is left to the caller.
 */
export function extractInlineImages(content: string): {
  cleanContent: string;
  images: Array<{ id: string; name: string; dataUrl: string }>;
} {
  const images: Array<{ id: string; name: string; dataUrl: string }> = [];
  const imgRegex = /<img\s+[^>]*data-inline-id="([^"]+)"[^>]*>/gi;

  let cleanContent = content;
  let match;

  while ((match = imgRegex.exec(content)) !== null) {
    const id = match[1];
    const fullTag = match[0];

    const srcMatch = fullTag.match(/src="([^"]*)"/);
    const altMatch = fullTag.match(/alt="([^"]*)"/);
    const dataFileNameMatch = fullTag.match(/data-file-name="([^"]*)"/);

    if (srcMatch && srcMatch[1].startsWith('data:')) {
      const dataUrl = srcMatch[1];
      const name = dataFileNameMatch?.[1] || altMatch?.[1] || `image-${id}.jpg`;

      images.push({ id, name, dataUrl });

      const placeholder = fullTag
        .replace(/src="[^"]*"/, 'src=""')
        .replace(/data-inline-id=/, 'data-inline-image-id=')
        .replace(/\s*data-file-name="[^"]*"/, '')
        .replace(/\s*data-size-kb="[^"]*"/, '');

      cleanContent = cleanContent.replace(fullTag, placeholder);
    }
  }

  return { cleanContent, images };
}

export function dataUrlToBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]*;base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  return match[1];
}

export function base64ToDataUrl(base64: string, mimeType = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64}`;
}

export function buildAttachmentMetadata(
  fileMeta: FileAttachmentMeta | null,
  inlineImages: InlineImageMeta[]
): string {
  const metadata: AttachmentMetadata = {
    file: fileMeta,
    inline_images: inlineImages.length > 0 ? inlineImages : undefined,
  };
  return JSON.stringify(metadata);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseAttachmentMetadata(raw: string | null): AttachmentMetadata {
  if (!raw) return { file: null, inline_images: [] };
    try {
    const parsed = JSON.parse(raw);
    // Migrate legacy plain-string format (just a file name, no chunks info)
    if (typeof parsed === 'string' || (parsed && typeof parsed.file === 'string')) {
      const name = typeof parsed === 'string' ? parsed : parsed.file;
      // Legacy file was stored as a single chunk at index 0
      return { file: name ? { name, chunks: [0] } : null, inline_images: [] };
    }
    return parsed as AttachmentMetadata;
  } catch {
    // Legacy: raw string is attachment file name (not valid JSON)
    return { file: raw ? { name: raw, chunks: [0] } : null, inline_images: [] };
  }
}

