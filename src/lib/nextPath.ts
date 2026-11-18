/** Returns a same-origin path safe to redirect to after login, or null. */
export function safeNextPath(value: string | null | undefined): string | null {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
    if (/[\u0000-\u001f]/.test(value)) return null;
    if (value === '/login' || value.startsWith('/login?') || value.startsWith('/api/')) return null;
    return value;
}
