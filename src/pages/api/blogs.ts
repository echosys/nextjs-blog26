import { NextApiRequest, NextApiResponse } from 'next';
import {
  createMongoBlog,
  deleteMongoBlog,
  getMongoBlogById,
  listMongoBlogs,
  updateMongoBlog,
} from '../../lib/storage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
};

const queryString = (value: unknown) => (typeof value === 'string' ? value : undefined);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const host = req.headers.host;

  try {
    if (req.method === 'GET') {
      const page = parseInt(queryString(req.query.page) ?? '') || 1;
      const limit = Math.min(parseInt(queryString(req.query.limit) ?? '') || 15, 100);
      const tag = queryString(req.query.tag);
      const id = queryString(req.query.id);

      // Single post fetch by id
      if (id) {
        const withAttachment = queryString(req.query.attachment) !== '0';
        const post = await getMongoBlogById(id, host, { withAttachment });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        return res.status(200).json(post);
      }

      const { blogs, total, totalPages } = await listMongoBlogs({ page, limit, tag, host });
      return res.status(200).json({ blogs, total, page, totalPages });
    }

    if (req.method === 'POST') {
      const { title, content, attachment, attachmentName, tags } = req.body;
      const result = await createMongoBlog({ title, content, attachment, attachmentName, tags }, host);
      return res.status(201).json(result);
    }

    if (req.method === 'PUT') {
      const { id, title, content, attachment, attachmentName, tags } = req.body;
      if (typeof id !== 'string' || !id) return res.status(400).json({ error: 'ID required' });
      const result = await updateMongoBlog(id, { title, content, attachment, attachmentName, tags }, host);
      return res.status(200).json(result);
    }

    if (req.method === 'DELETE') {
      const id = queryString(req.query.id);
      if (!id) return res.status(400).json({ error: 'ID required' });
      const result = await deleteMongoBlog(id, host);
      return res.status(200).json(result);
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error: any) {
    console.error('Mongo API error:', error?.message);
    return res.status(500).json({ error: error?.message ?? 'Database error' });
  }
}
