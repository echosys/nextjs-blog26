import { NextApiRequest, NextApiResponse } from 'next';
import { uploadPgInlineImageChunk, getPgInlineImageChunk } from '../../../lib/storage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

/**
 * POST: Upload an inline image chunk.
 * GET:  Download an inline image chunk.
 *
 * Query params:
 *   id         — post ID (required, positive integer)
 *   chunkIndex — chunk index used in post_chunks table (required, NEGATIVE integer,
 *                e.g. -1 for first image, -2 for second...)
 *
 * The caller is responsible for assigning and tracking chunkIndex values.
 * chunkIndex is stored in the attachment_name JSON metadata on the post row.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, chunkIndex } = req.query;
    const host = req.headers.host;

    if (!id || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Missing id or chunkIndex' });
    }

    const postId = Number(id);
    const chunkIdx = Number(chunkIndex);

    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!Number.isFinite(chunkIdx) || chunkIdx >= 0) {
      return res.status(400).json({ error: 'chunkIndex must be a negative integer (e.g. -1, -2)' });
    }

    if (req.method === 'POST') {
      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      await uploadPgInlineImageChunk(postId, chunkIdx, data, host);
      return res.status(200).json({ success: true });

    } else if (req.method === 'GET') {
      const base64Data = await getPgInlineImageChunk(postId, chunkIdx, host);
      if (!base64Data) {
        return res.status(404).json({ error: 'Image not found' });
      }

      return res.status(200).json({ data: base64Data });

    } else {
      res.setHeader('Allow', ['POST', 'GET']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('[inline-images] Error:', error?.message, error?.stack);
    return res.status(500).json({ error: error?.message ?? 'Internal server error' });
  }
}
