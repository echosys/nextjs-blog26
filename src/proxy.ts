import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';
import { safeNextPath } from './lib/nextPath';

const PUBLIC_API_ROUTES = new Set(['/api/login', '/api/logout', '/api/status', '/api/pg_status', '/api/keepalive']);

export async function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    const isLoggedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

    if (pathname.startsWith('/api')) {
        if (isLoggedIn || PUBLIC_API_ROUTES.has(pathname)) return NextResponse.next();
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isLoginPage = pathname === '/login';

    if (!isLoggedIn && !isLoginPage) {
        // Remember where each tab was headed so login returns it to the same app.
        const loginUrl = new URL('/login', request.url);
        if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
        return NextResponse.redirect(loginUrl);
    }

    if (isLoggedIn && isLoginPage) {
        const next = safeNextPath(request.nextUrl.searchParams.get('next')) ?? '/';
        return NextResponse.redirect(new URL(next, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
