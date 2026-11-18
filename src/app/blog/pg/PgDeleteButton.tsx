"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PgDeleteButton({ id }: { id: number }) {
    const router = useRouter();
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/pg_blogs?id=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            router.refresh();
        } catch (err: any) {
            setError(err?.message || 'Delete failed');
            setConfirm(false);
        } finally {
            setBusy(false);
        }
    };

    if (confirm) {
        return (
            <span className="flex items-center gap-1">
                <button onClick={handleDelete} disabled={busy} className="px-2 py-1 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 disabled:opacity-50 transition-all">Yes</button>
                <button onClick={() => setConfirm(false)} disabled={busy} className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all">No</button>
            </span>
        );
    }

    return (
        <button
            onClick={() => setConfirm(true)}
            className={`p-2 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all ${error ? 'text-rose-400' : 'text-slate-400'}`}
            title={error ? `Delete failed: ${error}` : "Delete post"}
        >
            <Trash2 size={16} />
        </button>
    );
}

