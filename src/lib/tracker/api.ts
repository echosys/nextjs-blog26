import type { NextApiRequest, NextApiResponse } from 'next';
import { isDateKey, toDateKey, TrackerInputError } from './model';

export function sendTrackerError(res: NextApiResponse, error: any) {
    if (error instanceof TrackerInputError) return res.status(400).json({ error: error.message });
    console.error('[tracker api]', error?.message);
    return res.status(500).json({ error: error?.message ?? 'Tracker storage error' });
}

export function queryString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

/** The browser's local day (sent by the client); falls back to the server's day. */
export function requestToday(req: NextApiRequest): string {
    const candidate = req.body?.today ?? req.query.today;
    return isDateKey(candidate) ? candidate : toDateKey(new Date());
}
