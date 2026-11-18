import type { NextApiRequest, NextApiResponse } from 'next';
import { runKeepAlive } from '../../lib/dbAdmin';
import { isKeepAliveEnabled } from '../../lib/runtimeConfig';

// Public and read-only: called by the login page and the daily Vercel cron (see vercel.json).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!isKeepAliveEnabled()) {
        return res.status(200).json({ enabled: false, results: [] });
    }

    const results = await runKeepAlive();
    const failed = results.some((result) => result.configured && !result.ok);
    if (failed) console.error('[keepalive] read failed', JSON.stringify(results));
    return res.status(failed ? 503 : 200).json({ enabled: true, at: new Date().toISOString(), results });
}
