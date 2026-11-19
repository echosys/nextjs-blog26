// Signed session cookie using Web Crypto so it works in both Edge middleware and Node API routes.
import runtimeConfig from './runtimeConfig';

export const SESSION_COOKIE = 'session';
// Browsers cap cookie lifetime at 400 days, so longer values are clamped.
const MAX_COOKIE_DAYS = 400;
const sessionDays = Math.min(Math.max(Number(runtimeConfig.auth?.sessionMaxAgeDays) || MAX_COOKIE_DAYS, 1), MAX_COOKIE_DAYS);
export const SESSION_MAX_AGE_SECONDS = Math.round(sessionDays * 24 * 60 * 60);

const encoder = new TextEncoder();

function getSecret(): string {
    // Falls back to the DB connection strings (server-only secrets) so existing deployments keep working.
    const secret = process.env.AUTH_SECRET || process.env.MONGODB_URI || process.env.POSTGRES_URL;
    if (secret) return secret;
    if (process.env.NODE_ENV !== 'production') return 'dev-only-session-secret';
    throw new Error('AUTH_SECRET is not set');
}

function getKey() {
    return crypto.subtle.importKey('raw', encoder.encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function createSessionToken(login: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
    const payload = toBase64Url(encoder.encode(JSON.stringify({ sub: login, exp })));
    const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(payload));
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
    if (!token) return false;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return false;

    try {
        const valid = await crypto.subtle.verify('HMAC', await getKey(), fromBase64Url(signature), encoder.encode(payload));
        if (!valid) return false;
        const { exp } = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
        return typeof exp === 'number' && exp > Date.now() / 1000;
    } catch {
        return false;
    }
}

export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
