"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Flame, ListChecks, Target } from "lucide-react";
import {
    addDays,
    buildHeatmap,
    categoryStats,
    entryActivity,
    formatDay,
    formatMetric,
    formatMonth,
    isMetricDone,
    monthKeyOf,
    toDateKey,
    type HeatmapCell,
    type TrackerCategory,
    type TrackerEntry,
    type TrackerTodo,
} from "../../lib/tracker/model";
import { LoadingCard, useMounted } from "./client";

const RANGES = [7, 30, 90, 365] as const;
const LEVEL_CLASS = ["bg-slate-800/70", "bg-teal-900", "bg-teal-700", "bg-teal-500", "bg-teal-300"];

function Heatmap({ columns, describe }: { columns: HeatmapCell[][]; describe: (date: string) => string }) {
    let lastMonth = "";
    return (
        <div className="overflow-x-auto pb-1">
            <div className="inline-flex flex-col gap-1">
                <div className="flex gap-[3px] text-[10px] text-slate-500 h-3">
                    {columns.map((column, index) => {
                        const first = column.find(Boolean);
                        const month = first ? monthKeyOf(first.date) : "";
                        const label = month && month !== lastMonth && first!.date.slice(8) <= "07" ? formatMonth(month).split(" ")[0].slice(0, 3) : "";
                        if (label) lastMonth = month;
                        return <span key={index} className="w-[11px] overflow-visible whitespace-nowrap">{label}</span>;
                    })}
                </div>
                <div className="flex gap-[3px]">
                    {columns.map((column, index) => (
                        <div key={index} className="flex flex-col gap-[3px]">
                            {column.map((cell, weekday) => cell
                                ? <span key={weekday} title={describe(cell.date)} className={`block w-[11px] h-[11px] rounded-[2px] ${LEVEL_CLASS[cell.level]}`} />
                                : <span key={weekday} className="block w-[11px] h-[11px]" />)}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500 self-end mt-1">
                    Less {LEVEL_CLASS.map((cls) => <span key={cls} className={`w-[11px] h-[11px] rounded-[2px] ${cls}`} />)} More
                </div>
            </div>
        </div>
    );
}

function BarChart({ series, goal, unit }: { series: { date: string; value: number }[]; goal?: number; unit?: string }) {
    const max = Math.max(goal ?? 0, ...series.map((point) => point.value), 1);
    const width = series.length * 10;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500"><span>{max.toLocaleString()} {unit}</span>{goal ? <span className="text-amber-400/80">goal {goal.toLocaleString()}</span> : null}</div>
            <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="w-full h-28 bg-slate-950/40 rounded-md" role="img" aria-label="Daily values">
                {series.map((point, index) => {
                    const height = (point.value / max) * 100;
                    return (
                        <rect key={point.date} x={index * 10 + 1} y={100 - height} width={8} height={height}
                            className={goal && point.value >= goal ? "fill-teal-300" : "fill-teal-600"}>
                            <title>{`${formatDay(point.date)}: ${point.value.toLocaleString()} ${unit ?? ""}`}</title>
                        </rect>
                    );
                })}
                {goal ? <line x1={0} x2={width} y1={100 - (goal / max) * 100} y2={100 - (goal / max) * 100} className="stroke-amber-400/70" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
            </svg>
            <div className="flex justify-between text-[10px] text-slate-500"><span>{formatDay(series[0].date, { month: "short", day: "numeric" })}</span><span>{formatDay(series[series.length - 1].date, { month: "short", day: "numeric" })}</span></div>
        </div>
    );
}

function DayStrip({ series }: { series: { date: string; value: number }[] }) {
    return (
        <div className="flex flex-wrap gap-[3px]">
            {series.map((point) => (
                <span key={point.date} title={`${formatDay(point.date)}: ${point.value > 0 ? "done" : "—"}`}
                    className={`w-[9px] h-[9px] rounded-[2px] ${point.value > 0 ? "bg-teal-400" : "bg-slate-800"}`} />
            ))}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-lg font-semibold text-white tabular-nums">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
        </div>
    );
}

export default function AnalyticsView({ categories, entries, todos }: { categories: TrackerCategory[]; entries: TrackerEntry[]; todos: TrackerTodo[] }) {
    const mounted = useMounted();
    const [range, setRange] = useState<(typeof RANGES)[number]>(30);
    const [selected, setSelected] = useState<string>("all");

    const entriesByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
    const today = mounted ? toDateKey(new Date()) : "";
    const start = today ? addDays(today, -(range - 1)) : "";
    const category = categories.find((item) => item.key === selected);

    const heatmap = useMemo(() => {
        if (!today) return [];
        const scores = new Map<string, number>();
        for (const entry of entries) {
            if (!category) { scores.set(entry.date, entryActivity(entry)); continue; }
            const value = entry.metrics[category.key];
            if (!isMetricDone(value)) continue;
            const ratio = category.type === "amount" && category.goal && typeof value === "number" ? value / category.goal : 1;
            scores.set(entry.date, Math.max(1, Math.min(4, Math.ceil(ratio * 4))));
        }
        return buildHeatmap(scores, today);
    }, [entries, category, today]);

    const stats = useMemo(
        () => (today ? categories.map((item) => ({ category: item, stats: categoryStats(item, entriesByDate, start, today) })) : []),
        [categories, entriesByDate, start, today],
    );

    if (!mounted) return <LoadingCard />;

    const yearStart = addDays(today, -364);
    const trackedThisYear = entries.filter((entry) => entry.date >= yearStart && entryActivity(entry) > 0).length;
    let journalStreak = 0;
    for (let day = entriesByDate.has(today) ? today : addDays(today, -1); entriesByDate.has(day); day = addDays(day, -1)) journalStreak++;
    const todosDone = todos.filter((todo) => todo.doneDate && todo.doneDate >= start && todo.doneDate <= today).length;
    const todosExpired = todos.filter((todo) => todo.kind === "regular" && !todo.doneAt && todo.dueAt && Date.parse(todo.dueAt) < Date.now() && toDateKey(new Date(todo.dueAt)) >= start).length;

    const describe = (date: string) => {
        const entry = entriesByDate.get(date);
        if (!entry) return `${formatDay(date)}: no entry`;
        const done = categories.filter((item) => isMetricDone(entry.metrics[item.key])).map((item) => item.type === "boolean" ? item.name : `${item.name} ${formatMetric(item, entry.metrics[item.key])}`);
        return `${formatDay(date)}: ${[...done, entry.notes.trim() ? "notes" : ""].filter(Boolean).join(", ") || "entry"}`;
    };

    const visible = category ? stats.filter((item) => item.category.key === category.key) : stats;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
                    {RANGES.map((option) => (
                        <button key={option} type="button" onClick={() => setRange(option)} aria-pressed={range === option}
                            className={`px-3 py-1.5 rounded-md ${range === option ? "bg-teal-500 text-white" : "text-slate-400 hover:text-white"}`}>
                            {option === 365 ? "1 year" : `${option} days`}
                        </button>
                    ))}
                </div>
                <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Category filter"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500">
                    <option value="all">All categories</option>
                    {categories.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
            </div>

            <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="flex items-center gap-2 font-semibold text-white"><CalendarDays size={16} className="text-teal-400" /> {category ? `${category.name} · last 12 months` : "Journal · last 12 months"}</h2>
                    <div className="flex gap-6">
                        <Stat label="days tracked (1y)" value={String(trackedThisYear)} />
                        <Stat label="journal streak" value={`${journalStreak}d`} />
                    </div>
                </div>
                <Heatmap columns={heatmap} describe={describe} />
            </section>

            <div className="grid gap-4 md:grid-cols-2 items-start">
                {visible.map(({ category: item, stats: itemStats }) => (
                    <section key={item.key} className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4 ${category ? "md:col-span-2" : ""}`}>
                        <div className="flex items-baseline justify-between gap-2">
                            <button type="button" onClick={() => setSelected(category ? "all" : item.key)} className="font-semibold text-white hover:text-teal-300 text-left">{item.name}</button>
                            <span className="text-xs text-slate-500">{item.type === "boolean" ? "done / not done" : `amount${item.unit ? ` · ${item.unit}` : ""}`}</span>
                        </div>
                        <div className="flex flex-wrap gap-6">
                            <Stat label={`of ${itemStats.days} days`} value={`${itemStats.activeDays}`} />
                            <Stat label="rate" value={`${Math.round((itemStats.activeDays / itemStats.days) * 100)}%`} />
                            <Stat label="current streak" value={`${itemStats.currentStreak}d`} />
                            <Stat label="longest streak" value={`${itemStats.longestStreak}d`} />
                            {item.type === "amount" && <>
                                <Stat label="total" value={itemStats.total.toLocaleString()} />
                                <Stat label="avg / logged day" value={Math.round(itemStats.average).toLocaleString()} />
                                <Stat label="best day" value={itemStats.best.toLocaleString()} />
                                {item.goal ? <Stat label={`days ≥ ${item.goal.toLocaleString()}`} value={String(itemStats.goalDays)} /> : null}
                            </>}
                        </div>
                        {item.type === "amount" ? <BarChart series={itemStats.series} goal={item.goal} unit={item.unit} /> : <DayStrip series={itemStats.series} />}
                        {category && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Target size={12} /> Days logged</h3>
                                {itemStats.activeDates.length === 0 ? <p className="text-sm text-slate-600">None in this period.</p> : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {[...itemStats.activeDates].reverse().map((date) => (
                                            <span key={date} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                                                {formatDay(date, { month: "short", day: "numeric" })}
                                                {item.type === "amount" ? ` · ${formatMetric(item, entriesByDate.get(date)?.metrics[item.key])}` : ""}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                ))}

                {!category && (
                    <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <h2 className="flex items-center gap-2 font-semibold text-white"><ListChecks size={16} className="text-teal-400" /> To-dos</h2>
                        <div className="flex flex-wrap gap-6">
                            <Stat label={`completed in ${range} days`} value={String(todosDone)} />
                            <Stat label="quick to-dos expired" value={String(todosExpired)} />
                            <Stat label="open long-term" value={String(todos.filter((todo) => todo.kind === "longterm" && !todo.doneAt).length)} />
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5"><Flame size={12} /> Completed to-dos also appear on that day&apos;s journal entry.</p>
                    </section>
                )}
            </div>
        </div>
    );
}
