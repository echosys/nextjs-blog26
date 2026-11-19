import type { NextApiRequest, NextApiResponse } from 'next';
import { createCategory, listCategories, restoreCategory, retireCategory, updateCategory } from '../../../lib/tracker/storage';
import { sanitizeCategoryInput } from '../../../lib/tracker/model';
import { queryString, requestToday, sendTrackerError } from '../../../lib/tracker/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const host = req.headers.host;
    try {
        if (req.method === 'GET') return res.status(200).json(await listCategories(host));
        if (req.method === 'POST') return res.status(201).json(await createCategory(host, sanitizeCategoryInput(req.body), requestToday(req)));

        const key = queryString(req.query.key);
        if (!key) return res.status(400).json({ error: 'key required' });

        if (req.method === 'PATCH') {
            if (req.body?.restore === true) {
                await restoreCategory(host, key);
                return res.status(200).json({ success: true });
            }
            return res.status(200).json(await updateCategory(host, key, sanitizeCategoryInput(req.body), requestToday(req)));
        }
        if (req.method === 'DELETE') {
            await retireCategory(host, key, requestToday(req));
            return res.status(200).json({ success: true });
        }
        res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        return sendTrackerError(res, error);
    }
}
