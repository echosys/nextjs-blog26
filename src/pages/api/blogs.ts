import { NextApiRequest, NextApiResponse } from 'next';
import {
  createMongoBlog,
  deleteMongoBlog,
  getMongoBlogById,
  listMongoBlogs,
  updateMongoBlog,
} from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const host = req.headers.host;

  if (req.method === 'GET') {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const skip = (page - 1) * limit;
    const tag = req.query.tag as string;
    const id = req.query.id as string;

    // Single post fetch by id
    if (id) {
      const post = await getMongoBlogById(id, host);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      return res.status(200).json(post);
    }

    const { blogs, total, totalPages } = await listMongoBlogs({ page, limit, tag, host });

    res.status(200).json({ blogs, total, page, totalPages });
  } else if (req.method === 'POST') {
    const { title, content, attachment, attachmentName, tags } = req.body;
    const result = await createMongoBlog({ title, content, attachment, attachmentName, tags }, host);

    res.status(201).json(result);
  } else if (req.method === 'PUT') {
    const { id, title, content, attachment, attachmentName, tags } = req.body;
    const result = await updateMongoBlog(id, { title, content, attachment, attachmentName, tags }, host);

    res.status(200).json(result);
  } else if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });

    const result = await deleteMongoBlog(id as string, host);

    res.status(200).json(result);
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
