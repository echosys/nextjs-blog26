import { NextApiRequest, NextApiResponse } from 'next';
import { uploadPgChunk } from '../../../lib/storage';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const id = Number(req.query.id);
    const index = Number(req.query.index);
    const { data } = req.body ?? {};

    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(index) || index < 0 || typeof data !== 'string' || !data) {
        return res.status(400).json({ error: 'Missing or invalid id, index, or data' });
    }

    try {
        await uploadPgChunk(id, index, data, req.headers.host);
        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[chunks] uploadPgChunk failed:', error?.message, error?.stack);
        return res.status(500).json({ error: error?.message ?? 'Internal server error' });
    }
}

