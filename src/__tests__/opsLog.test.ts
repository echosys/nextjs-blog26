import { describe, expect, it } from 'vitest';
import { clientIp, resolveKeepAliveSource } from '../lib/opsLog';

describe('resolveKeepAliveSource', () => {
    it('detects the Vercel cron by user agent, regardless of query', () => {
        expect(resolveKeepAliveSource({ 'user-agent': 'vercel-cron/1.0' }, 'settings')).toBe('cron');
    });

    it('accepts known UI sources and rejects spoofed or unknown ones', () => {
        expect(resolveKeepAliveSource({ 'user-agent': 'Mozilla/5.0' }, 'login-page')).toBe('login-page');
        expect(resolveKeepAliveSource({}, 'settings')).toBe('settings');
        expect(resolveKeepAliveSource({}, 'cron')).toBe('api');
        expect(resolveKeepAliveSource({}, 'whatever')).toBe('api');
        expect(resolveKeepAliveSource({}, ['settings'])).toBe('api');
    });
});

describe('clientIp', () => {
    it('uses the first x-forwarded-for hop, then x-real-ip, then the socket', () => {
        expect(clientIp({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, '127.0.0.1')).toBe('203.0.113.7');
        expect(clientIp({ 'x-real-ip': '198.51.100.2' }, '127.0.0.1')).toBe('198.51.100.2');
        expect(clientIp({}, '::ffff:127.0.0.1')).toBe('127.0.0.1');
        expect(clientIp({})).toBe('unknown');
    });
});
