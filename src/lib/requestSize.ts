import { formatBytes } from './inlineImages';

// Vercel rejects request bodies over 4.5 MB; keep headroom for headers/encoding differences.
export const MAX_SINGLE_REQUEST_BYTES = 4_400_000;

/** Returns a user-facing error if a single-request save would exceed the platform body limit. */
export function checkRequestSize(body: string, attachmentDataUrl = ''): string | null {
    const total = new Blob([body]).size;
    if (total <= MAX_SINGLE_REQUEST_BYTES) return null;
    const attachmentPart = attachmentDataUrl ? ` (attachment ${formatBytes(attachmentDataUrl.length)})` : '';
    return `This post is ${formatBytes(total)}${attachmentPart}, but one save can be at most ${formatBytes(MAX_SINGLE_REQUEST_BYTES)}. Remove some inline images or use a smaller attachment.`;
}
