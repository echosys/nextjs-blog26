import { NextApiRequest, NextApiResponse } from 'next';
import { uploadPgChunk } from '../../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { id, index } = req.query;
    const { data } = req.body;

    if (!id || index === undefined || !data) {
        return res.status(400).json({ error: 'Missing id, index, or data' });
    }

    try {
        await uploadPgChunk(parseInt(id as string), parseInt(index as string), data, req.headers.host);
        return res.status(200).json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}

