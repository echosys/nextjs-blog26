"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, ListChecks, Plus, Save, Settings2, X } from "lucide-react";
import {
    addDays,
    formatDay,
    formatMetric,
    formatMonth,
    isMetricDone,
    monthKeyOf,
    toDateKey,
    type TrackerCategory,
    type TrackerEntry,
    type TrackerTodo,
} from "../../lib/tracker/model";
import { LoadingCard, trackerRequest, useMounted } from "./client";

type FormMetrics = Record<string, boolean | string>;

function toForm(entry: TrackerEntry | undefined, categories: TrackerCategory[]): FormMetrics {
    const form: FormMetrics = {};
    for (const category of categories) {
        const value = entry?.metrics[category.key];
        form[category.key] = category.type === "boolean" ? value === true : typeof value === "number" ? String(value) : "";
    }
    return form;
}

export default function JournalView({ categories, entries, todos }: { categories: TrackerCategory[]; entries: TrackerEntry[]; todos: TrackerTodo[] }) {
    const mounted = useMounted();
    const router = useRouter();
    const [date, setDate] = useState("");
    const [notes, setNotes] = useState("");
    const [metrics, setMetrics] = useState<FormMetrics>({});
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
    const [showCategories, setShowCategories] = useState(false);

    const entriesByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
    const todosByDate = useMemo(() => {
        const map = new Map<string, TrackerTodo[]>();
        for (const todo of todos) {
            if (!todo.doneDate) continue;
            map.set(todo.doneDate, [...(map.get(todo.doneDate) ?? []), todo]);
        }
        return map;
    }, [todos]);

    useEffect(() => { if (mounted && !date) setDate(toDateKey(new Date())); }, [mounted, date]);

    // Load the selected day into the form whenever the day or the saved data changes.
    useEffect(() => {
        if (!date) return;
        const entry = entriesByDate.get(date);
        setNotes(entry?.notes ?? "");
        setMetrics(toForm(entry, categories));
        setDirty(false);
    }, [date, entriesByDate, categories]);

    const months = useMemo(() => {
        const days = [...new Set([...entriesByDate.keys(), ...todosByDate.keys()])].sort().reverse();
        const groups: { month: string; days: string[] }[] = [];
        for (const day of days) {
            const month = monthKeyOf(day);
            const last = groups[groups.length - 1];
            if (last?.month === month) last.days.push(day);
            else groups.push({ month, days: [day] });
        }
        return groups;
    }, [entriesByDate, todosByDate]);

    if (!mounted || !date) return <LoadingCard />;

    const today = toDateKey(new Date());
    const update = (key: string, value: boolean | string) => { setMetrics((prev) => ({ ...prev, [key]: value })); setDirty(true); };

    const save = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload: Record<string, boolean | number> = {};
            for (const category of categories) {
                const value = metrics[category.key];
                if (category.type === "boolean") payload[category.key] = value === true;
                else if (typeof value === "string" && value.trim() !== "") payload[category.key] = Number(value);
            }
            const { entry } = await trackerRequest<{ entry: TrackerEntry | null }>("entries", "PUT", { date, notes, metrics: payload });
            setMessage({ tone: "ok", text: entry ? "Saved" : "Nothing recorded — day cleared" });
            setDirty(false);
            router.refresh();
        } catch (error: any) {
            setMessage({ tone: "error", text: error.message });
        } finally {
            setSaving(false);
        }
    };

    const selectDate = (next: string) => {
        if (dirty && !window.confirm("Discard unsaved changes for this day?")) return;
        setMessage(null);
        setDate(next);
    };

    const dayTodos = todosByDate.get(date) ?? [];
    const existing = entriesByDate.get(date);

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
            <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-5 lg:sticky lg:top-6">
                <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => selectDate(addDays(date, -1))} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Previous day"><ChevronLeft size={18} /></button>
                    <div className="text-center">
                        <input type="date" value={date} max={today} onChange={(e) => e.target.value && selectDate(e.target.value)}
                            className="bg-transparent text-white font-semibold text-center [color-scheme:dark] focus:outline-none" aria-label="Journal date" />
                        <p className="text-xs text-slate-500">{date === today ? "Today" : formatDay(date, { weekday: "long" })}{existing ? "" : " · no entry yet"}</p>
                    </div>
                    <button type="button" onClick={() => selectDate(addDays(date, 1))} disabled={date >= today} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30" aria-label="Next day"><ChevronRight size={18} /></button>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Progress</h2>
                        <button type="button" onClick={() => setShowCategories((v) => !v)} className="text-xs text-slate-500 hover:text-teal-400 flex items-center gap-1">
                            <Settings2 size={12} /> {showCategories ? "Done" : "Categories"}
                        </button>
                    </div>
                    {categories.length === 0 && <p className="text-sm text-slate-500">No categories yet — add one below.</p>}
                    {categories.map((category) => category.type === "boolean" ? (
                        <button key={category.key} type="button" onClick={() => update(category.key, metrics[category.key] !== true)} aria-pressed={metrics[category.key] === true}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${metrics[category.key] === true ? "border-teal-500/40 bg-teal-500/10 text-teal-300" : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700"}`}>
                            <span>{category.name}</span>
                            {metrics[category.key] === true ? <CheckCircle2 size={18} /> : <Circle size={18} className="text-slate-600" />}
                        </button>
                    ) : (
                        <label key={category.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950/50 text-sm text-slate-300">
                            <span className="shrink-0">{category.name}</span>
                            <span className="flex items-center gap-2 min-w-0">
                                <input type="number" min={0} step="any" inputMode="decimal" value={String(metrics[category.key] ?? "")} placeholder="—"
                                    onChange={(e) => update(category.key, e.target.value)}
                                    className="w-28 bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-right text-white focus:outline-none focus:border-teal-500" />
                                <span className="text-xs text-slate-500 w-12 truncate">{category.unit ?? ""}</span>
                            </span>
                        </label>
                    ))}
                    {showCategories && <CategoryManager categories={categories} onChanged={() => router.refresh()} />}
                </div>

                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</h2>
                    <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} rows={6} placeholder="How did today go?"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500 resize-y" />
                </div>

                {dayTodos.length > 0 && (
                    <div className="space-y-1">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><ListChecks size={12} /> To-dos completed</h2>
                        <ul className="text-sm text-slate-300 space-y-0.5">
                            {dayTodos.map((todo) => <li key={todo.id} className="flex items-center gap-2"><CheckCircle2 size={14} className="text-teal-500 shrink-0" /> <span className="truncate">{todo.title}</span></li>)}
                        </ul>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button type="button" onClick={save} disabled={saving}
                        className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all">
                        <Save size={16} /> {saving ? "Saving..." : "Save day"}
                    </button>
                    {dirty && <span className="text-xs text-amber-400">Unsaved</span>}
                    {message && <span className={`text-xs ${message.tone === "ok" ? "text-teal-400" : "text-rose-400"}`}>{message.text}</span>}
                </div>
            </section>

            <section className="space-y-6 min-w-0">
                {months.length === 0 && (
                    <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                        No tracked days yet. Fill in today on the left and save.
                    </div>
                )}
                {months.map((group) => (
                    <div key={group.month} className="space-y-2">
                        <h2 className="text-sm font-semibold text-slate-400">{formatMonth(group.month)} <span className="text-slate-600 font-normal">· {group.days.length} {group.days.length === 1 ? "day" : "days"}</span></h2>
                        <div className="space-y-2">
                            {group.days.map((day) => {
                                const entry = entriesByDate.get(day);
                                const completed = todosByDate.get(day) ?? [];
                                return (
                                    <button key={day} type="button" onClick={() => selectDate(day)}
                                        className={`w-full text-left bg-slate-900/50 border rounded-xl px-4 py-3 transition-all ${day === date ? "border-teal-500/50" : "border-slate-800 hover:border-slate-700"}`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium text-white w-28 shrink-0">{formatDay(day)}</span>
                                            {categories.filter((category) => isMetricDone(entry?.metrics[category.key])).map((category) => (
                                                <span key={category.key} className="text-[11px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">
                                                    {category.type === "boolean" ? `✓ ${category.name}` : `${category.name} ${formatMetric(category, entry?.metrics[category.key])}`}
                                                </span>
                                            ))}
                                            {completed.length > 0 && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 flex items-center gap-1"><ListChecks size={11} /> {completed.length} to-do{completed.length === 1 ? "" : "s"}</span>
                                            )}
                                        </div>
                                        {entry?.notes.trim() && <p className="text-sm text-slate-400 mt-1.5 line-clamp-2 whitespace-pre-line">{entry.notes}</p>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}

function CategoryManager({ categories, onChanged }: { categories: TrackerCategory[]; onChanged: () => void }) {
    const [name, setName] = useState("");
    const [type, setType] = useState<"boolean" | "amount">("boolean");
    const [unit, setUnit] = useState("");
    const [goal, setGoal] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await trackerRequest("categories", "POST", { name, type, unit, goal });
            setName(""); setUnit(""); setGoal("");
            onChanged();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (category: TrackerCategory) => {
        if (!window.confirm(`Remove "${category.name}"? Values already saved stay in old entries but are hidden.`)) return;
        try {
            await trackerRequest(`categories?key=${encodeURIComponent(category.key)}`, "DELETE");
            onChanged();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="mt-3 p-3 rounded-lg border border-dashed border-slate-700 space-y-3">
            <ul className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                    <li key={category.key} className="text-xs flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {category.name}<span className="text-slate-500">· {category.type === "boolean" ? "yes/no" : category.unit || "amount"}</span>
                        <button type="button" onClick={() => remove(category)} className="p-0.5 text-slate-500 hover:text-rose-400" aria-label={`Remove ${category.name}`}><X size={12} /></button>
                    </li>
                ))}
            </ul>
            <form onSubmit={add} className="grid grid-cols-2 gap-2 text-sm">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category (e.g. Water)" required maxLength={40}
                    className="col-span-2 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-teal-500" />
                <select value={type} onChange={(e) => setType(e.target.value as "boolean" | "amount")} aria-label="Category type"
                    className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500">
                    <option value="boolean">Done / not done</option>
                    <option value="amount">Amount</option>
                </select>
                {type === "amount" ? (
                    <div className="flex gap-2">
                        <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" maxLength={20} className="w-1/2 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-teal-500" />
                        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="goal" type="number" min={0} className="w-1/2 bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-teal-500" />
                    </div>
                ) : <span />}
                <button type="submit" disabled={busy} className="col-span-2 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-md py-1.5">
                    <Plus size={14} /> Add category
                </button>
                {error && <p className="col-span-2 text-xs text-rose-400">{error}</p>}
            </form>
        </div>
    );
}
