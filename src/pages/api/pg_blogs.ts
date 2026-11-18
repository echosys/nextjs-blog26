import { NextApiRequest, NextApiResponse } from 'next';
import {
    createPgBlog,
    deletePgBlog,
    getPgBlogById,
    listPgBlogs,
    updatePgBlog,
} from '../../lib/storage';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const host = req.headers.host;
        const parseId = (value: unknown) => {
            const parsed = Number(value);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
        };

        if (req.method === 'GET') {
            const { tag } = req.query;

            if (req.query.id !== undefined) {
                const id = parseId(req.query.id);
                if (!id) return res.status(400).json({ error: 'Invalid id' });
                const post = await getPgBlogById(id, host);
                return res.status(200).json(post || null);
            }

            const result = await listPgBlogs({ tag: typeof tag === 'string' ? tag : undefined, host });
            return res.status(200).json(result);

        } else if (req.method === 'POST') {
            const { title, content, tags, attachment_name, attachment_data } = req.body;
            const result = await createPgBlog({ title, content, tags, attachment_name, attachment_data }, host);
            return res.status(201).json(result);

        } else if (req.method === 'PUT') {
            const { id, title, content, tags, attachment_name, attachment_data, clear_attachment } = req.body;
            if (!parseId(id)) return res.status(400).json({ error: 'Invalid id' });
            const result = await updatePgBlog({ id, title, content, tags, attachment_name, attachment_data, clear_attachment }, host);
            return res.status(200).json(result);

        } else if (req.method === 'DELETE') {
            const id = parseId(req.query.id);
            if (!id) return res.status(400).json({ error: 'Invalid id' });
            const result = await deletePgBlog(id, host);
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
