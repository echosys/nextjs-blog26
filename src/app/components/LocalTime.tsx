"use client";

import { useEffect, useState } from "react";

function relative(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h ago`;
    return `${Math.round(hours / 24)} days ago`;
}

/** Formats an ISO timestamp in the browser's timezone (server-rendered pages would otherwise use the server's). */
export default function LocalTime({ iso, withRelative = false }: { iso: string; withRelative?: boolean }) {
    const [text, setText] = useState<string | null>(null);
    useEffect(() => {
        const date = new Date(iso);
        const absolute = date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        setText(withRelative ? `${absolute} (${relative(Date.now() - date.getTime())})` : absolute);
    }, [iso, withRelative]);
    return <time dateTime={iso} title={iso}>{text ?? iso.slice(0, 16).replace("T", " ")}</time>;
}
