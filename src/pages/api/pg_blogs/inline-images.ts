import { NextApiRequest, NextApiResponse } from 'next';
import { uploadPgInlineImageChunk, getPgInlineImageChunk, deleteAllPgChunks } from '../../../lib/storage';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

/**
 * POST /api/pg_blogs/inline-images?id=<postId>&chunkIndex=<n>
 *   Upload one inline image chunk. chunkIndex is a non-negative integer assigned by the caller.
 *
 * GET  /api/pg_blogs/inline-images?id=<postId>&chunkIndex=<n>
 *   Fetch one inline image chunk by its exact index.
 *
 * DELETE /api/pg_blogs/inline-images?id=<postId>
 *   Delete ALL chunks for a post (used before re-uploading on edit).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, chunkIndex } = req.query;
    const host = req.headers.host;

    const postId = Number(id);
    if (!id || !Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Missing or invalid id' });
    }

    if (req.method === 'DELETE') {
      await deleteAllPgChunks(postId, host);
      return res.status(200).json({ success: true });
    }

    const chunkIdx = Number(chunkIndex);
    if (chunkIndex === undefined || !Number.isFinite(chunkIdx) || chunkIdx < 0) {
      return res.status(400).json({ error: 'chunkIndex must be a non-negative integer' });
    }

    if (req.method === 'POST') {
      const { data } = req.body;
      if (!data) return res.status(400).json({ error: 'Missing image data' });
      await uploadPgInlineImageChunk(postId, chunkIdx, data, host);
      return res.status(200).json({ success: true });

    } else if (req.method === 'GET') {
      const base64Data = await getPgInlineImageChunk(postId, chunkIdx, host);
      if (!base64Data) return res.status(404).json({ error: 'Image not found' });
      return res.status(200).json({ data: base64Data });

    } else {
      res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('[inline-images] Error:', error?.message, error?.stack);
    return res.status(500).json({ error: error?.message ?? 'Internal server error' });
  }
}
