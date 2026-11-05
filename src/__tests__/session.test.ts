import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '../lib/session';

describe('session tokens', () => {
    it('accepts a token it signed', async () => {
        expect(await verifySessionToken(await createSessionToken('test'))).toBe(true);
    });

    it('rejects missing, legacy, and tampered tokens', async () => {
        const token = await createSessionToken('test');
        const [payload, signature] = token.split('.');
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9999999999 })).toString('base64url');

        expect(await verifySessionToken(undefined)).toBe(false);
        expect(await verifySessionToken('true')).toBe(false);
        expect(await verifySessionToken(`${forgedPayload}.${signature}`)).toBe(false);
        expect(await verifySessionToken(`${payload}.${signature.slice(0, -2)}xx`)).toBe(false);
        expect(await verifySessionToken(`${token}.extra`)).toBe(false);
    });

    it('rejects expired tokens', async () => {
        const token = await createSessionToken('test');
        const realNow = Date.now;
        Date.now = () => realNow() + 401 * 24 * 60 * 60 * 1000;
        try {
            expect(await verifySessionToken(token)).toBe(false);
        } finally {
            Date.now = realNow;
        }
    });
});
