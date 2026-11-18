import type { NextApiRequest, NextApiResponse } from 'next';
import { createCategory, deleteCategory, listCategories } from '../../../lib/tracker/storage';
import { sanitizeCategoryInput } from '../../../lib/tracker/model';
import { queryString, sendTrackerError } from '../../../lib/tracker/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const host = req.headers.host;
    try {
        if (req.method === 'GET') return res.status(200).json(await listCategories(host));
        if (req.method === 'POST') return res.status(201).json(await createCategory(host, sanitizeCategoryInput(req.body)));
        if (req.method === 'DELETE') {
            const key = queryString(req.query.key);
            if (!key) return res.status(400).json({ error: 'key required' });
            await deleteCategory(host, key);
            return res.status(200).json({ success: true });
        }
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        return sendTrackerError(res, error);
    }
}
