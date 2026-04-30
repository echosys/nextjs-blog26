/**
 * Inline image utilities for Postgres blog
 * Instead of embedding base64 data URLs in content, we:
 * 1. Store image references in content as data-inline-image-id attributes
 * 2. Store actual image data in post_chunks table with negative indices
 * 3. Store metadata in attachment_name as JSON
 */

export type InlineImageMetadata = {
  id: string;
  name: string;
  chunkIndex: number; // negative integer, e.g. -1 for first image, -2 for second
};

export type AttachmentMetadata = {
  file?: string | null;
  inline_images?: InlineImageMetadata[];
};

/**
 * Compute the chunk index for inline image at position i (0-based).
 * Convention: inline images use chunk_index < 0; file attachment uses chunk_index >= 0.
 */
export function inlineChunkIndex(i: number): number {
  return -(i + 1); // 0 → -1, 1 → -2, ...
}

/**
 * Extract inline images from HTML content
 * Returns content with data URLs removed and replaced with empty src placeholder
 * and array of images to be stored in chunks — each with its assigned chunkIndex.
 */
export function extractInlineImages(content: string): {
  cleanContent: string;
  images: Array<{ id: string; name: string; dataUrl: string; chunkIndex: number }>;
} {
  const images: Array<{ id: string; name: string; dataUrl: string; chunkIndex: number }> = [];
  const imgRegex = /<img\s+[^>]*data-inline-id="([^"]+)"[^>]*>/gi;
  
  let cleanContent = content;
  let match;
  let imagePosition = 0;
  
  while ((match = imgRegex.exec(content)) !== null) {
    const id = match[1];
    const fullTag = match[0];
    
    // Extract src and filename from the img tag
    const srcMatch = fullTag.match(/src="([^"]*)"/);
    const altMatch = fullTag.match(/alt="([^"]*)"/);
    // Note: dataset.fileName becomes data-file-name in HTML
    const dataFileNameMatch = fullTag.match(/data-file-name="([^"]*)"/);
    
    if (srcMatch && srcMatch[1].startsWith('data:')) {
      const dataUrl = srcMatch[1];
      const name = dataFileNameMatch?.[1] || altMatch?.[1] || `image-${id}.jpg`;
      const chunkIndex = inlineChunkIndex(imagePosition);
      
      images.push({ id, name, dataUrl, chunkIndex });
      imagePosition++;
      
      // Replace the full img tag with one that has src="" placeholder
      // Keep data-inline-image-id so we can look up the chunk later
      const placeholder = fullTag
        .replace(/src="[^"]*"/, 'src=""')
        .replace(/data-inline-id/, 'data-inline-image-id')
        .replace(/data-file-name="[^"]*"/, '')
        .replace(/data-size-kb="[^"]*"/, '');
      
      cleanContent = cleanContent.replace(fullTag, placeholder);
    }
  }
  
  return { cleanContent, images };
}

/**
 * Convert base64 data URL to base64 string (for chunk storage)
 */
export function dataUrlToBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]*;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  return match[1];
}

/**
 * Convert base64 string back to data URL
 */
export function base64ToDataUrl(base64: string, mimeType: string = 'image/jpeg'): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Build attachment metadata JSON
 */
export function buildAttachmentMetadata(
  fileName: string | null,
  inlineImages: InlineImageMetadata[]
): string {
  const metadata: AttachmentMetadata = {
    file: fileName,
    inline_images: inlineImages.length > 0 ? inlineImages : undefined,
  };
  return JSON.stringify(metadata);
}

/**
 * Parse attachment metadata JSON
 */
export function parseAttachmentMetadata(metadata: string | null): AttachmentMetadata {
  if (!metadata) return { file: null, inline_images: [] };
  try {
    return JSON.parse(metadata);
  } catch {
    // Fallback for old format (plain attachment name)
    return { file: metadata, inline_images: [] };
  }
}
