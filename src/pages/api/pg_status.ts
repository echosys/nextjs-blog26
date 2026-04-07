import type { NextApiRequest, NextApiResponse } from 'next';
import { getPostgresStatus } from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        const status = await getPostgresStatus(req.headers.host);
        if (status.status === 'ok') {
            return res.status(200).json(status);
        }

        return res.status(503).json(status);
    } catch (error: any) {
        return res.status(503).json({ status: 'error', message: error.message, host: 'unknown' });
    }
}

