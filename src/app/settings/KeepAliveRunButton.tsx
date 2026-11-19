"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type Result = { backend: string; configured: boolean; ok: boolean; ms?: number; message?: string };

export default function KeepAliveRunButton() {
    const router = useRouter();
    const [running, setRunning] = useState(false);
    const [response, setResponse] = useState<{ enabled: boolean; at?: string; results: Result[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setRunning(true);
        setError(null);
        try {
            const res = await fetch("/api/keepalive?source=settings", { cache: "no-store", signal: AbortSignal.timeout(20000) });
            setResponse(await res.json());
            router.refresh();
        } catch (err: any) {
            setError(err?.name === "TimeoutError" ? "No response after 20s" : "Request failed");
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-3">
            <button type="button" onClick={run} disabled={running}
                className="inline-flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 px-3 py-1.5 rounded-lg transition-all">
                <RefreshCw size={14} className={running ? "animate-spin" : ""} />
                {running ? "Reading..." : "Run keep-alive now"}
            </button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            {response && !response.enabled && <p className="text-xs text-slate-400">Keep-alive is disabled in config; no database was touched.</p>}
            {response?.enabled && (
                <ul className="text-xs space-y-1">
                    {response.results.map((result) => (
                        <li key={result.backend} className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${!result.configured ? "bg-slate-600" : result.ok ? "bg-teal-500" : "bg-rose-500"}`} />
                            <span className="font-mono text-slate-300 w-16">{result.backend}</span>
                            <span className={result.ok ? "text-teal-400" : result.configured ? "text-rose-400" : "text-slate-500"}>
                                {!result.configured ? "not configured" : result.ok ? `read ok (${result.ms} ms)` : `failed: ${result.message}`}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
