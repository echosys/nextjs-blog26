import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';

const PUBLIC_API_ROUTES = new Set(['/api/login', '/api/logout', '/api/status', '/api/pg_status']);

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isLoggedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

    if (pathname.startsWith('/api')) {
        if (isLoggedIn || PUBLIC_API_ROUTES.has(pathname)) return NextResponse.next();
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isLoginPage = pathname === '/login';

    if (!isLoggedIn && !isLoginPage) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isLoggedIn && isLoginPage) {
        return NextResponse.redirect(new URL('/mongo', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
