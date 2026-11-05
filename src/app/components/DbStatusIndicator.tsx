"use client";

import { useEffect, useState } from "react";

const TIMEOUT_MS = 15000;

type State = { status: "checking" | "ok" | "error"; message?: string };

export default function DbStatusIndicator({
    endpoint,
    title,
    value,
    detail,
}: {
    endpoint: string;
    title: string;
    value: string;
    detail: string;
}) {
    const [state, setState] = useState<State>({ status: "checking" });

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        fetch(endpoint, { cache: "no-store", signal: controller.signal })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                setState(res.ok
                    ? { status: "ok" }
                    : { status: "error", message: data.message || `HTTP ${res.status}` });
            })
            .catch((error) => {
                setState({
                    status: "error",
                    message: error?.name === "AbortError" ? `No response after ${TIMEOUT_MS / 1000}s` : "Request failed",
                });
            })
            .finally(() => clearTimeout(timer));

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [endpoint]);

    const dotClass = state.status === "ok"
        ? "bg-teal-500"
        : state.status === "error"
            ? "bg-rose-500"
            : "bg-yellow-400 animate-pulse";

    const tooltip = state.status === "error"
        ? `${title} unreachable: ${state.message}`
        : state.status === "ok" ? `${title} connected` : `Checking ${title}...`;

    return (
        <div className="flex items-center gap-2" title={tooltip}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
            <span className="text-slate-400 font-medium">{title}:</span>
            <span className="font-mono text-slate-500">{value}</span>
            <span className="font-mono text-slate-600 hidden sm:inline">{detail}</span>
            {state.status === "error" && (
                <span className="font-medium text-rose-400">Unreachable</span>
            )}
        </div>
    );
}
