import { NextApiRequest, NextApiResponse } from 'next';
import { getPgAttachment } from '../../../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { id } = req.query;

    try {
        const attachment = await getPgAttachment(Number(id), req.headers.host);
        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${attachment.attachmentName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', attachment.buffer.length);
        return res.status(200).send(attachment.buffer);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}


