import type { NextApiRequest, NextApiResponse } from 'next';
import { getLoginStatus } from '../../lib/storage';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        const status = await getLoginStatus(req.headers.host);
        if (status.status === 'ok') {
            return res.status(200).json(status);
        }

        return res.status(503).json(status);
    } catch (error: any) {
        console.error('Database connection error:', error);
        return res.status(503).json({ status: 'error', message: error.message || 'Database connection failed' });
    }
}
