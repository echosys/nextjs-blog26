import type { NextApiRequest, NextApiResponse } from 'next';
import { runKeepAlive } from '../../lib/dbAdmin';
import { isKeepAliveEnabled } from '../../lib/runtimeConfig';
import { recordKeepAliveRun, resolveKeepAliveSource } from '../../lib/opsLog';

// Public: called by the login page, the Settings button, and the daily Vercel cron (see vercel.json).
// Reads one row per database, then records the run (time, source, results) in the ops log.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!isKeepAliveEnabled()) {
        return res.status(200).json({ enabled: false, results: [] });
    }

    const source = resolveKeepAliveSource(req.headers, req.query.source);
    const results = await runKeepAlive();
    await recordKeepAliveRun(req.headers.host, source, results);
    const failed = results.some((result) => result.configured && !result.ok);
    if (failed) console.error('[keepalive] read failed', JSON.stringify({ source, results }));
    return res.status(failed ? 503 : 200).json({ enabled: true, at: new Date().toISOString(), source, results });
}
