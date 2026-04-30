/**
 * Hook for fetching and reconstructing inline images from Postgres chunks.
 * Requires the ordered list of InlineImageMetadata (from attachment_name JSON),
 * each entry containing the explicit chunkIndex that was used when saving.
 */
import { useEffect, useState } from 'react';
import { base64ToDataUrl, type InlineImageMetadata } from './inlineImages';

export type InlineImageState = {
  [id: string]: {
    dataUrl: string;
    loading: boolean;
    error: boolean;
  };
};

/**
 * Fetch inline images from Postgres chunks using explicit chunkIndex values.
 * postId: the post ID
 * inlineImageMeta: array from attachment_name JSON, each item has { id, chunkIndex }
 */
export function usePgInlineImages(
  postId: number | null,
  inlineImageMeta: InlineImageMetadata[]
): InlineImageState {
  const [images, setImages] = useState<InlineImageState>({});

  useEffect(() => {
    if (!postId || !inlineImageMeta.length) return;

    const loadImages = async () => {
      for (const meta of inlineImageMeta) {
        setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: true, error: false } }));
        try {
          const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&chunkIndex=${meta.chunkIndex}`);
          if (!res.ok) {
            setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: false, error: true } }));
          } else {
            const { data: base64 } = await res.json();
            setImages(prev => ({ ...prev, [meta.id]: { dataUrl: base64ToDataUrl(base64), loading: false, error: false } }));
          }
        } catch {
          setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: false, error: true } }));
        }
      }
    };

    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, JSON.stringify(inlineImageMeta)]);

  return images;
}

/**
 * Extract inline image IDs in DOM order from HTML content.
 * Looks for img tags with data-inline-image-id attributes.
 */
export function extractInlineImageIds(htmlContent: string): string[] {
  const regex = /data-inline-image-id="([^"]*)"/g;
  const ids: string[] = [];
  let match;
  while ((match = regex.exec(htmlContent)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * Replace inline image placeholders (src="") with fetched data URLs.
 */
export function reconstructInlineImages(
  htmlContent: string,
  imageState: InlineImageState
): string {
  let result = htmlContent;
  for (const [imageId, imageData] of Object.entries(imageState)) {
    if (imageData.dataUrl) {
      const regex = new RegExp(
        `(<img\\s+[^>]*data-inline-image-id="${imageId}"[^>]*)src=""`,
        'g'
      );
      result = result.replace(regex, `$1src="${imageData.dataUrl}"`);
    }
  }
  return result;
}

/**
 * Load inline images into HTML for the editor (edit flow).
 * Uses explicit chunkIndex from InlineImageMetadata.
 */
export async function loadInlineImagesForEdit(
  postId: number,
  htmlContent: string,
  inlineImageMeta: InlineImageMetadata[]
): Promise<string> {
  if (!inlineImageMeta.length) return htmlContent;

  let result = htmlContent;
  for (const meta of inlineImageMeta) {
    try {
      const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&chunkIndex=${meta.chunkIndex}`);
      if (res.ok) {
        const { data: base64 } = await res.json();
        const dataUrl = base64ToDataUrl(base64);
        const regex = new RegExp(
          `(<img\\s+[^>]*data-inline-image-id="${meta.id}"[^>]*)src=""`,
          'g'
        );
        result = result.replace(regex, `$1src="${dataUrl}"`);
      }
    } catch (err) {
      console.error(`Failed to load inline image ${meta.id} (chunkIndex ${meta.chunkIndex}):`, err);
    }
  }
  return result;
}

