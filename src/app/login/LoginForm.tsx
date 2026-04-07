"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Database, ServerCrash } from "lucide-react";

type DbStatus = 'idle' | 'checking' | 'ok' | 'error';

interface DbState {
    status: DbStatus;
    host: string;
    label?: string;
    mode?: string;
    message?: string;
}

function StatusDot({ status }: { status: DbStatus }) {
    if (status === 'checking') return (
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
    );
    if (status === 'ok') return (
        <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-teal-400" />
        </span>
    );
    if (status === 'error') return (
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
    );
    return <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block" />;
}

function StatusLabel({ status, host }: { status: DbStatus; host: string }) {
    if (status === 'checking') return <span className="text-xs text-yellow-400 font-medium">Checking...</span>;
    if (status === 'ok') return (
        <span className="text-xs text-teal-400 font-medium truncate max-w-[120px]" title={host}>
            {host || 'Connected'}
        </span>
    );
    if (status === 'error') return <span className="text-xs text-rose-400 font-medium">Unreachable</span>;
    return <span className="text-xs text-slate-500">—</span>;
}

export default function LoginForm() {
    const [login, setLogin] = useState("");
    const [pw, setPw] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mongo, setMongo] = useState<DbState>({ status: 'idle', host: '' });
    const [pg, setPg] = useState<DbState>({ status: 'idle', host: '' });
    const router = useRouter();

    useEffect(() => {
        // Check MongoDB
        setMongo({ status: 'checking', host: '' });
        fetch('/api/status')
            .then(async res => {
                const d = await res.json().catch(() => ({}));
                if (res.ok) {
                    setMongo({ status: 'ok', host: d.host || 'Connected', label: d.label, mode: d.mode });
                } else {
                    setMongo({ status: 'error', host: d.host || '', label: d.label, mode: d.mode, message: d.message });
                }
            })
            .catch(() => setMongo({ status: 'error', host: '' }));

        // Check Postgres
        setPg({ status: 'checking', host: '' });
        fetch('/api/pg_status')
            .then(async res => {
                const d = await res.json().catch(() => ({}));
                if (res.ok) {
                    setPg({ status: 'ok', host: d.host || 'Connected', label: d.label, mode: d.mode });
                } else {
                    setPg({ status: 'error', host: d.host || '', label: d.label, mode: d.mode, message: d.message });
                }
            })
            .catch(() => setPg({ status: 'error', host: '' }));
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, pw }),
            });

            if (res.ok) {
                router.push("/mongo");
                router.refresh();
            } else {
                const data = await res.json();
                setError(data.error || 'Invalid credentials');
            }
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const mongoDown = mongo.status === 'error';

    return (
        <>
            {/* Database Status Panel */}
            <div className="mb-6 rounded-xl bg-slate-950/50 border border-slate-800 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                    <Database size={14} className="text-slate-500" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Database Status</span>
                </div>
                <div className="divide-y divide-slate-800">
                    {/* MongoDB row */}
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <StatusDot status={mongo.status} />
                            <span className="text-sm font-medium text-slate-300 shrink-0">Login/Auth</span>
                            <span className="text-xs text-slate-600 font-mono truncate hidden sm:block">
                                ({mongo.label || 'storage'}{mongo.mode ? `:${mongo.mode}` : ''})
                            </span>
                        </div>
                        <StatusLabel status={mongo.status} host={mongo.host} />
                    </div>
                    {/* Postgres row */}
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <StatusDot status={pg.status} />
                            <span className="text-sm font-medium text-slate-300 shrink-0">PG Blog</span>
                            <span className="text-xs text-slate-600 font-mono truncate hidden sm:block">
                                ({pg.label || 'storage'}{pg.mode ? `:${pg.mode}` : ''})
                            </span>
                        </div>
                        <StatusLabel status={pg.status} host={pg.host} />
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-center gap-2">
                    <ServerCrash size={16} />
                    {error}
                </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                    <input
                        type="text"
                        value={login}
                        onChange={e => setLogin(e.target.value)}
                        placeholder="Enter your username"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors placeholder:text-slate-600"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                    <input
                        type="password"
                        value={pw}
                        onChange={e => setPw(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors placeholder:text-slate-600"
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading || mongoDown}
                    className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg flex justify-center items-center gap-2 transition-all shadow-lg shadow-teal-500/20 mt-2"
                >
                    {isLoading ? (
                        <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                        <>
                            <LogIn size={20} />
                            Sign In
                        </>
                    )}
                </button>

                {mongoDown && (
                    <p className="text-center text-xs text-rose-400 mt-2">
                        Login is unavailable for the active auth storage.
                    </p>
                )}
                {pg.status === 'error' && !mongoDown && (
                    <p className="text-center text-xs text-yellow-500 mt-1">
                        The configured PG blog storage is unavailable.
                    </p>
                )}
            </form>
        </>
    );
}
