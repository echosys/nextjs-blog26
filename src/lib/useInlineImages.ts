/**
 * Hook for fetching and reconstructing inline images from Postgres chunks
 */
import { useEffect, useState } from 'react';
import { base64ToDataUrl } from './inlineImages';

export type InlineImageState = {
  [id: string]: {
    dataUrl: string;
    loading: boolean;
    error: boolean;
  };
};

export function usePgInlineImages(
  postId: number | null,
  inlineImageIds: string[]
): InlineImageState {
  const [images, setImages] = useState<InlineImageState>({});

  useEffect(() => {
    if (!postId || !inlineImageIds.length) return;

    const loadImages = async () => {
      const newImages: InlineImageState = {};

      for (let i = 0; i < inlineImageIds.length; i++) {
        const imageId = inlineImageIds[i];
        newImages[imageId] = { dataUrl: '', loading: true, error: false };

        try {
          const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&index=${i}`);
          if (!res.ok) {
            newImages[imageId].error = true;
          } else {
            const { data: base64 } = await res.json();
            newImages[imageId].dataUrl = base64ToDataUrl(base64);
          }
        } catch (err) {
          newImages[imageId].error = true;
        } finally {
          newImages[imageId].loading = false;
        }

        setImages(prev => ({ ...prev, [imageId]: newImages[imageId] }));
      }
    };

    loadImages();
  }, [postId, inlineImageIds]);

  return images;
}

/**
 * Extract inline image IDs from HTML content
 * Looks for img tags with data-inline-image-id attributes
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
 * Replace inline image placeholders with data URLs
 */
export function reconstructInlineImages(
  htmlContent: string,
  imageDataUrls: InlineImageState
): string {
  let result = htmlContent;

  for (const [imageId, imageData] of Object.entries(imageDataUrls)) {
    if (imageData.dataUrl) {
      // Find img tags with this image ID and replace src=""  with the data URL
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
 * Load inline images for editing
 * Returns HTML content with inline image data URLs reconstructed
 */
export async function loadInlineImagesForEdit(
  postId: number,
  htmlContent: string
): Promise<string> {
  const imageIds = extractInlineImageIds(htmlContent);
  if (!imageIds.length) return htmlContent;

  let result = htmlContent;

  for (let i = 0; i < imageIds.length; i++) {
    const imageId = imageIds[i];
    try {
      const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&index=${i}`);
      if (res.ok) {
        const { data: base64 } = await res.json();
        const dataUrl = base64ToDataUrl(base64);
        const regex = new RegExp(
          `(<img\\s+[^>]*data-inline-image-id="${imageId}"[^>]*)src=""`,
          'g'
        );
        result = result.replace(regex, `$1src="${dataUrl}"`);
      }
    } catch (err) {
      console.error(`Failed to load inline image ${i}:`, err);
    }
  }

  return result;
}
