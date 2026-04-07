import { NextApiRequest, NextApiResponse } from 'next';
import {
    createPgBlog,
    deletePgBlog,
    getPgBlogById,
    listPgBlogs,
    updatePgBlog,
} from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const host = req.headers.host;

        if (req.method === 'GET') {
            const { tag, id } = req.query;

            if (id) {
                const post = await getPgBlogById(Number(id), host);
                return res.status(200).json(post || null);
            }

            const result = await listPgBlogs({ tag: tag as string | undefined, host });
            return res.status(200).json(result);

        } else if (req.method === 'POST') {
            const { title, content, tags, attachment_name, attachment_data } = req.body;
            const result = await createPgBlog({ title, content, tags, attachment_name, attachment_data }, host);
            return res.status(201).json(result);

        } else if (req.method === 'PUT') {
            const { id, title, content, tags, attachment_name, attachment_data, clear_attachment } = req.body;
            const result = await updatePgBlog({ id, title, content, tags, attachment_name, attachment_data, clear_attachment }, host);
            return res.status(200).json(result);

        } else if (req.method === 'DELETE') {
            const { id } = req.query;
            const result = await deletePgBlog(Number(id), host);
            return res.status(200).json(result);

        } else {
            res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
            return res.status(405).end(`Method ${req.method} Not Allowed`);
        }
    } catch (error: any) {
        console.error('PG API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
