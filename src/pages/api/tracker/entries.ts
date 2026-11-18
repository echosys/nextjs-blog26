import type { NextApiRequest, NextApiResponse } from 'next';
import { listCategories, listEntries, saveEntry } from '../../../lib/tracker/storage';
import { sanitizeEntryInput } from '../../../lib/tracker/model';
import { sendTrackerError } from '../../../lib/tracker/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const host = req.headers.host;
    try {
        if (req.method === 'GET') return res.status(200).json(await listEntries(host));
        if (req.method === 'PUT') {
            const input = sanitizeEntryInput(req.body, await listCategories(host));
            return res.status(200).json({ entry: await saveEntry(host, input) });
        }
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (error) {
        return sendTrackerError(res, error);
    }
}
