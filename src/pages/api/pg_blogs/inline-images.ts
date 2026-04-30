import { NextApiRequest, NextApiResponse } from 'next';
import { uploadPgInlineImageChunk, getPgInlineImageChunk } from '../../../lib/storage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', // Each inline image chunk is <= 4MB
    },
  },
};

/**
 * POST: Upload an inline image chunk
 * GET: Download an inline image chunk
 * DELETE: Delete an inline image chunk
 * 
 * Query params:
 *   id: post ID (required)
 *   index: image index (0-based, required)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, index } = req.query;
    const host = req.headers.host;

    if (!id || index === undefined) {
      return res.status(400).json({ error: 'Missing id or index' });
    }

    const postId = Number(id);
    const imageIndex = Number(index);

    if (!Number.isFinite(postId) || !Number.isFinite(imageIndex) || imageIndex < 0) {
      return res.status(400).json({ error: 'Invalid id or index' });
    }

    if (req.method === 'POST') {
      const { data } = req.body;
      if (!data) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      await uploadPgInlineImageChunk(postId, imageIndex, data, host);
      return res.status(200).json({ success: true });

    } else if (req.method === 'GET') {
      const base64Data = await getPgInlineImageChunk(postId, imageIndex, host);
      if (!base64Data) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Return as JSON so client can construct data URL
      return res.status(200).json({ data: base64Data });

    } else {
      res.setHeader('Allow', ['POST', 'GET']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error('[inline-images] Error:', error?.message);
    return res.status(500).json({ error: error?.message ?? 'Internal server error' });
  }
}
