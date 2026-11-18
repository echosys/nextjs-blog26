import { NextApiRequest, NextApiResponse } from 'next';
import { getMongoBlogById } from '../../../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'ID required' });

    try {
        const post = await getMongoBlogById(id, req.headers.host);
        const match = typeof post?.attachment === 'string' ? /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(post.attachment) : null;
        if (!match) return res.status(404).json({ error: 'Attachment not found' });

        const [, , isBase64, payload] = match;
        const buffer = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
        const name = String(post?.attachmentName || 'attachment');
        const asciiName = name.replace(/[^\x20-\x7E]|["\\]/g, '_');

        // Always octet-stream so a stored HTML/SVG attachment can't render inline on this origin.
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
        res.setHeader('Content-Length', buffer.length);
        return res.status(200).send(buffer);
    } catch (error: any) {
        return res.status(500).json({ error: error?.message ?? 'Database error' });
    }
}
