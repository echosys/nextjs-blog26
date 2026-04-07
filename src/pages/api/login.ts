import { NextApiRequest, NextApiResponse } from 'next';
import { authenticateUser } from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { login, pw } = req.body;

    if (!login || !pw) {
        return res.status(400).json({ error: 'Login and Password required' });
    }

    const isAuthenticated = await authenticateUser(login, pw, req.headers.host);

    if (isAuthenticated) {
        // In a real app, use JWT or sessions. For this template, we'll return success.
        // The user mentioned "simple cookie-based auth".
        res.setHeader('Set-Cookie', `auth=true; Path=/; SameSite=Strict; Max-Age=315360000`);
        res.status(200).json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
}
