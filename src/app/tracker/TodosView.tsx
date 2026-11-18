"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Clock, History, Pin, Plus, RotateCcw, Star, Trash2, Zap } from "lucide-react";
import { bucketTodos, formatDay, formatMonth, toDateKey, type TrackerTodo } from "../../lib/tracker/model";
import { LoadingCard, trackerRequest, useMounted } from "./client";

type Settings = { regularTodoWindowDays: number; activeTodoLimit: number };

function timeLeft(dueAt: string | undefined, nowMs: number): string {
    if (!dueAt) return "";
    const hours = Math.max(0, Math.round((Date.parse(dueAt) - nowMs) / 3_600_000));
    return hours >= 24 ? `${Math.round(hours / 24)}d left` : `${hours}h left`;
}

function Card({ icon: Icon, title, hint, accent, children }: { icon: typeof Zap; title: string; hint?: string; accent: string; children: React.ReactNode }) {
    return (
        <section className={`bg-slate-900/50 border rounded-2xl p-4 space-y-3 ${accent}`}>
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold text-white"><Icon size={16} /> {title}</h2>
                {hint && <span className="text-xs text-slate-500">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

function Empty({ text }: { text: string }) {
    return <p className="text-sm text-slate-600 px-1">{text}</p>;
}

export default function TodosView({ todos, settings }: { todos: TrackerTodo[]; settings: Settings }) {
    const mounted = useMounted();
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [kind, setKind] = useState<"regular" | "longterm">("regular");
    const [tier, setTier] = useState<1 | 2>(1);
    const [showAllNow, setShowAllNow] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const nowMs = mounted ? Date.now() : 0;
    const buckets = useMemo(
        () => bucketTodos(todos, nowMs, showAllNow ? Number.MAX_SAFE_INTEGER : settings.activeTodoLimit),
        [todos, nowMs, showAllNow, settings.activeTodoLimit],
    );

    if (!mounted) return <LoadingCard />;

    const run = async (id: string, action: () => Promise<unknown>) => {
        setBusyId(id);
        setError(null);
        try {
            await action();
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const patch = (todo: TrackerTodo, body: Record<string, unknown>) => run(todo.id, () => trackerRequest(`todos?id=${encodeURIComponent(todo.id)}`, "PATCH", body));
    const toggleDone = (todo: TrackerTodo) => patch(todo, todo.doneAt ? { done: false } : { done: true, doneDate: toDateKey(new Date()) });
    const remove = (todo: TrackerTodo) => run(todo.id, () => trackerRequest(`todos?id=${encodeURIComponent(todo.id)}`, "DELETE"));

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;
        await run("new", () => trackerRequest("todos", "POST", { title, kind, tier }));
        setTitle("");
    };

    const iconButton = "p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40";

    const row = (todo: TrackerTodo, children?: React.ReactNode, muted = false) => (
        <li key={todo.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg ${muted ? "" : "bg-slate-950/40"} ${busyId === todo.id ? "opacity-50" : ""}`}>
            <button type="button" onClick={() => toggleDone(todo)} disabled={busyId === todo.id} aria-label={todo.doneAt ? `Mark "${todo.title}" not done` : `Mark "${todo.title}" done`}
                className="shrink-0 text-slate-500 hover:text-teal-400">
                {todo.doneAt ? <CheckCircle2 size={18} className="text-teal-500" /> : <Circle size={18} />}
            </button>
            <span className={`flex-1 min-w-0 truncate text-sm ${todo.doneAt ? "line-through text-slate-500" : "text-slate-200"}`} title={todo.title}>{todo.title}</span>
            <span className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                {children}
                <button type="button" onClick={() => remove(todo)} disabled={busyId === todo.id} className={`${iconButton} hover:text-rose-400`} aria-label={`Delete "${todo.title}"`} title="Delete"><Trash2 size={14} /></button>
            </span>
        </li>
    );

    return (
        <div className="space-y-5">
            <form onSubmit={add} className="flex flex-wrap items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-3">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a to-do..." maxLength={200} aria-label="To-do title"
                    className="flex-1 min-w-[12rem] bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500" />
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                    {(["regular", "longterm"] as const).map((option) => (
                        <button key={option} type="button" onClick={() => setKind(option)} aria-pressed={kind === option}
                            className={`px-3 py-1.5 rounded-md ${kind === option ? "bg-teal-500 text-white" : "text-slate-400 hover:text-white"}`}>
                            {option === "regular" ? `Quick · ${settings.regularTodoWindowDays}d` : "Long-term"}
                        </button>
                    ))}
                </div>
                {kind === "longterm" && (
                    <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                        {([1, 2] as const).map((option) => (
                            <button key={option} type="button" onClick={() => setTier(option)} aria-pressed={tier === option}
                                className={`px-3 py-1.5 rounded-md ${tier === option ? "bg-amber-500/80 text-white" : "text-slate-400 hover:text-white"}`}>
                                Tier {option}
                            </button>
                        ))}
                    </div>
                )}
                <button type="submit" disabled={busyId === "new" || !title.trim()} className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1.5">
                    <Plus size={16} /> Add
                </button>
            </form>
            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="grid gap-5 lg:grid-cols-2 items-start">
                <div className="space-y-5">
                    <Card icon={Zap} title="Now" hint={`quick to-dos stay ${settings.regularTodoWindowDays} days`} accent="border-teal-500/30">
                        {buckets.now.length === 0 ? <Empty text="Nothing due. Add a quick to-do above." /> : (
                            <ul className="space-y-1">
                                {buckets.now.map((todo) => row(todo, <>
                                    {!todo.doneAt && <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1"><Clock size={11} />{timeLeft(todo.dueAt, nowMs)}</span>}
                                    {!todo.doneAt && <button type="button" onClick={() => patch(todo, { kind: "longterm", tier: 2 })} className={iconButton} title="Keep until done (move to long-term, tier 2)"><Pin size={14} /></button>}
                                </>))}
                            </ul>
                        )}
                        {(buckets.nowHidden > 0 || showAllNow) && (
                            <button type="button" onClick={() => setShowAllNow((v) => !v)} className="text-xs text-slate-400 hover:text-teal-400">
                                {showAllNow ? "Show fewer" : `+ ${buckets.nowHidden} more`}
                            </button>
                        )}
                    </Card>

                    <Card icon={History} title="History" hint={buckets.expiredCount ? `${buckets.expiredCount} expired in backlog` : undefined} accent="border-slate-800">
                        {buckets.history.length === 0 ? <Empty text="Finished and expired to-dos land here." /> : buckets.history.map((group, index) => (
                            <details key={group.month} open={index === 0} className="group/month">
                                <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-200 py-1 select-none">
                                    {formatMonth(group.month)} <span className="text-slate-600">· {group.items.filter((item) => item.status === "done").length} done, {group.items.filter((item) => item.status === "expired").length} expired</span>
                                </summary>
                                <ul className="space-y-0.5 mt-1">
                                    {group.items.map((item) => row(item, <>
                                        <span className={`text-[11px] mr-1 ${item.status === "done" ? "text-slate-500" : "text-amber-400"}`}>
                                            {item.status === "done" ? formatDay(item.day, { month: "short", day: "numeric" }) : "expired"}
                                        </span>
                                        {item.status === "expired" && <>
                                            <button type="button" onClick={() => patch(item, { revive: true })} className={iconButton} title={`Back to Now for ${settings.regularTodoWindowDays} days`}><RotateCcw size={14} /></button>
                                            <button type="button" onClick={() => patch(item, { kind: "longterm", tier: 2 })} className={iconButton} title="Move to long-term (tier 2)"><Pin size={14} /></button>
                                        </>}
                                    </>, true))}
                                </ul>
                            </details>
                        ))}
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card icon={Star} title="Tier 1 · must do" hint="always visible" accent="border-amber-500/40">
                        {buckets.tier1.length === 0 ? <Empty text="No top-priority items." /> : (
                            <ul className="space-y-1">
                                {buckets.tier1.map((todo) => row(todo,
                                    <button type="button" onClick={() => patch(todo, { tier: 2 })} className={iconButton} title="Lower to tier 2"><ArrowDown size={14} /></button>,
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card icon={Pin} title="Tier 2 · important" hint={buckets.tier2.length ? `${buckets.tier2.length} open` : undefined} accent="border-slate-800">
                        {buckets.tier2.length === 0 ? <Empty text="Nothing waiting here." /> : (
                            <ul className="space-y-0.5">
                                {buckets.tier2.map((todo) => row(todo,
                                    <button type="button" onClick={() => patch(todo, { tier: 1 })} className={iconButton} title="Raise to tier 1"><ArrowUp size={14} /></button>,
                                    true,
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
