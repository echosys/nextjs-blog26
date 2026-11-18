import type { NextApiResponse } from 'next';
import { TrackerInputError } from './model';

export function sendTrackerError(res: NextApiResponse, error: any) {
    if (error instanceof TrackerInputError) return res.status(400).json({ error: error.message });
    console.error('[tracker api]', error?.message);
    return res.status(500).json({ error: error?.message ?? 'Tracker storage error' });
}

export function queryString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}
