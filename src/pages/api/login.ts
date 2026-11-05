import { NextApiRequest, NextApiResponse } from 'next';
import { authenticateUser } from '../../lib/storage';
import { createSessionToken, sessionCookie, SESSION_MAX_AGE_SECONDS } from '../../lib/session';
import { resolveRuntimeProfile } from '../../lib/runtimeConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { login, pw } = req.body ?? {};

    // Reject non-strings so objects like {"$ne": null} can't reach the Mongo query.
    if (typeof login !== 'string' || typeof pw !== 'string' || !login || !pw || login.length > 200 || pw.length > 200) {
        return res.status(400).json({ error: 'Login and Password required' });
    }

    try {
        if (!(await authenticateUser(login, pw, req.headers.host))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const secure = resolveRuntimeProfile(req.headers.host) === 'deploy';
        res.setHeader('Set-Cookie', [
            sessionCookie(await createSessionToken(login), SESSION_MAX_AGE_SECONDS, secure),
            'auth=; Path=/; Max-Age=0',
        ]);
        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[login] failed:', error?.message);
        return res.status(503).json({ error: 'Login is temporarily unavailable' });
    }
}
