"use client";

import { useEffect, useState } from "react";

/** Date-dependent views render after mount so "today" uses the browser's timezone, not the server's. */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}

export async function trackerRequest<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api/tracker/${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
}

export function LoadingCard() {
    return <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-sm text-slate-500 animate-pulse">Loading...</div>;
}

export function StorageError({ message }: { message: string }) {
    return (
        <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-rose-400 text-sm">
            Tracker storage error — {message}. Check the database status in the footer.
        </div>
    );
}
