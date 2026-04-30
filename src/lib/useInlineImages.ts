/**
 * Hook + helpers for fetching Postgres inline images from post_chunks.
 */
import { useEffect, useState } from 'react';
import { base64ToDataUrl, type InlineImageMeta } from './inlineImages';

export type InlineImageState = {
  [id: string]: { dataUrl: string; loading: boolean; error: boolean };
};

/**
 * Fetch inline images for preview.
 * inlineImageMeta comes from parseAttachmentMetadata(post.attachment_name).inline_images
 */
export function usePgInlineImages(
  postId: number | null,
  inlineImageMeta: InlineImageMeta[]
): InlineImageState {
  const [images, setImages] = useState<InlineImageState>({});

  useEffect(() => {
    if (!postId || !inlineImageMeta.length) return;

    const load = async () => {
      for (const meta of inlineImageMeta) {
        const chunkIdx = meta.chunks[0];
        if (chunkIdx === undefined) continue;
        setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: true, error: false } }));
        try {
          const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&chunkIndex=${chunkIdx}`);
          if (!res.ok) {
            setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: false, error: true } }));
          } else {
            const { data } = await res.json();
            setImages(prev => ({ ...prev, [meta.id]: { dataUrl: base64ToDataUrl(data), loading: false, error: false } }));
          }
        } catch {
          setImages(prev => ({ ...prev, [meta.id]: { dataUrl: '', loading: false, error: true } }));
        }
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, JSON.stringify(inlineImageMeta)]);

  return images;
}

/** Replace src="" placeholders with fetched data URLs. */
export function reconstructInlineImages(htmlContent: string, state: InlineImageState): string {
  let result = htmlContent;
  for (const [id, img] of Object.entries(state)) {
    if (img.dataUrl) {
      // Find the complete <img> tag containing data-inline-image-id, then swap src="" inside it.
      // Attribute order is not guaranteed, so we use a callback to do a targeted sub-replace.
      result = result.replace(
        new RegExp(`<img\\b[^>]*\\bdata-inline-image-id="${id}"[^>]*>`, 'g'),
        (match) => match.replace(/\bsrc=""/, `src="${img.dataUrl}"`)
      );
    }
  }
  return result;
}

/**
 * Reload inline images into HTML for the editor.
 * Converts data-inline-image-id back to data-inline-id and restores src so
 * ContentEditor's collectInlineImages() can detect them normally.
 */
export async function loadInlineImagesForEdit(
  postId: number,
  htmlContent: string,
  inlineImageMeta: InlineImageMeta[]
): Promise<string> {
  if (!inlineImageMeta.length) return htmlContent;

  // Thumbnail style matching ContentEditor's makeImgElement
  const thumbStyle =
    'width:100px;height:auto;max-width:400px;border-radius:4px;display:inline-block;' +
    'vertical-align:middle;margin:2px 4px;cursor:default;resize:both;overflow:hidden;' +
    'box-shadow:0 0 0 1px #334155;';

  let result = htmlContent;
  for (const meta of inlineImageMeta) {
    const chunkIdx = meta.chunks[0];
    if (chunkIdx === undefined) continue;
    try {
      const res = await fetch(`/api/pg_blogs/inline-images?id=${postId}&chunkIndex=${chunkIdx}`);
      if (!res.ok) continue;
      const { data } = await res.json();
      const dataUrl = base64ToDataUrl(data);
      const sizeKB = Math.round(data.length * 0.75 / 1024);
      // Replace the whole placeholder <img ... data-inline-image-id="..."> with an editor-native img
      result = result.replace(
        new RegExp(`<img\\s+[^>]*data-inline-image-id="${meta.id}"[^>]*>`, 'g'),
        `<img src="${dataUrl}" alt="inline image" data-inline-id="${meta.id}" ` +
        `data-file-name="${meta.name}" data-size-kb="${sizeKB}" style="${thumbStyle}">`
      );
    } catch (err) {
      console.error(`Failed to load inline image ${meta.id}:`, err);
    }
  }
  return result;
}

