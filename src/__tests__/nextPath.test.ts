import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../lib/nextPath';

describe('safeNextPath', () => {
    it('keeps same-origin app paths with query strings', () => {
        expect(safeNextPath('/blog/pg?tag=news')).toBe('/blog/pg?tag=news');
        expect(safeNextPath('/sample')).toBe('/sample');
    });

    it('rejects open redirects and loops', () => {
        for (const value of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '/login', '/login?next=/x', '/api/blogs', '/a\nb']) {
            expect(safeNextPath(value)).toBeNull();
        }
    });
});
