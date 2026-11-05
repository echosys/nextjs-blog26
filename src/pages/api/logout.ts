import { NextApiRequest, NextApiResponse } from 'next';
import { sessionCookie } from '../../lib/session';
import { resolveRuntimeProfile } from '../../lib/runtimeConfig';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const secure = resolveRuntimeProfile(req.headers.host) === 'deploy';
    res.setHeader('Set-Cookie', [sessionCookie('', 0, secure), 'auth=; Path=/; Max-Age=0']);
    return res.status(200).json({ success: true });
}
