// Client-safe tracker types and pure helpers (no Node or DB imports).

export type CategoryType = 'boolean' | 'amount';
export type MetricValue = boolean | number;

export type TrackerCategory = {
    id: string;
    /** Immutable storage key used in entry metrics; never reused, so old data can't be relabelled. */
    key: string;
    name: string;
    type: CategoryType;
    unit?: string;
    goal?: number;
    createdAt: string;
    /** Local day the category started; unset for seeded defaults. */
    startedOn?: string;
    /** Local day the category was retired (deleted or replaced). Retired categories keep their data but take no new values. */
    retiredOn?: string;
    /** Key of the category created when this one was renamed or retyped. */
    replacedBy?: string;
};

export function isActiveCategory(category: TrackerCategory): boolean {
    return !category.retiredOn;
}

export type TrackerEntry = {
    id: string;
    /** Local calendar day, YYYY-MM-DD. */
    date: string;
    notes: string;
    metrics: Record<string, MetricValue>;
    createdAt: string;
    updatedAt?: string;
};

export type TodoKind = 'regular' | 'longterm';

export type TrackerTodo = {
    id: string;
    title: string;
    kind: TodoKind;
    /** 1 = must always be visible, 2 = important but secondary. Only meaningful for long-term to-dos. */
    tier: 1 | 2;
    createdAt: string;
    /** Regular to-dos leave the "Now" list after this instant. */
    dueAt?: string;
    doneAt?: string;
    /** Local day the to-do was completed; links it to that day's journal. */
    doneDate?: string;
};

// ---------- dates ----------

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = DATE_KEY.exec(value);
    if (!match) return false;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export function toDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
}

export function monthKeyOf(key: string): string {
    return key.slice(0, 7);
}

export function formatMonth(monthKey: string): string {
    return parseDateKey(`${monthKey}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDay(key: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
    return parseDateKey(key).toLocaleDateString(undefined, options);
}

export function daysBetween(fromKey: string, toKey: string): number {
    return Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86_400_000);
}

// ---------- metrics ----------

export function isMetricDone(value: MetricValue | undefined): boolean {
    return value === true || (typeof value === 'number' && value > 0);
}

export function entryActivity(entry: TrackerEntry | undefined): number {
    if (!entry) return 0;
    return Object.values(entry.metrics).filter(isMetricDone).length + (entry.notes.trim() ? 1 : 0);
}

export function formatMetric(category: TrackerCategory, value: MetricValue | undefined): string {
    if (category.type === 'boolean') return value === true ? 'done' : 'not done';
    const amount = typeof value === 'number' ? value : 0;
    return `${amount.toLocaleString()}${category.unit ? ` ${category.unit}` : ''}`;
}

// ---------- to-dos ----------

export type HistoryItem = TrackerTodo & { status: 'done' | 'expired'; day: string };

export type TodoBuckets = {
    now: TrackerTodo[];
    nowHidden: number;
    tier1: TrackerTodo[];
    tier2: TrackerTodo[];
    history: { month: string; items: HistoryItem[] }[];
    expiredCount: number;
};

export function bucketTodos(todos: TrackerTodo[], nowMs: number, nowLimit: number, toDay: (iso: string) => string = (iso) => toDateKey(new Date(iso))): TodoBuckets {
    const isOpenRegular = (todo: TrackerTodo) => todo.kind === 'regular' && (!todo.dueAt || Date.parse(todo.dueAt) > nowMs);

    const now = todos.filter(isOpenRegular).sort((a, b) => {
        if (Boolean(a.doneAt) !== Boolean(b.doneAt)) return a.doneAt ? 1 : -1;
        if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
        return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
    });

    const longterm = (tier: 1 | 2) => todos
        .filter((todo) => todo.kind === 'longterm' && !todo.doneAt && todo.tier === tier)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const historyItems: HistoryItem[] = todos
        .filter((todo) => (todo.kind === 'regular' && !isOpenRegular(todo)) || (todo.kind === 'longterm' && todo.doneAt))
        .map((todo) => ({
            ...todo,
            status: todo.doneAt ? 'done' as const : 'expired' as const,
            day: todo.doneDate ?? toDay(todo.doneAt ?? todo.dueAt ?? todo.createdAt),
        }))
        .sort((a, b) => b.day.localeCompare(a.day));

    const history: TodoBuckets['history'] = [];
    for (const item of historyItems) {
        const month = monthKeyOf(item.day);
        const group = history[history.length - 1];
        if (group?.month === month) group.items.push(item);
        else history.push({ month, items: [item] });
    }

    return {
        now: now.slice(0, nowLimit),
        nowHidden: Math.max(0, now.length - nowLimit),
        tier1: longterm(1),
        tier2: longterm(2),
        history,
        expiredCount: historyItems.filter((item) => item.status === 'expired').length,
    };
}

// ---------- analytics ----------

export type HeatmapCell = { date: string; level: 0 | 1 | 2 | 3 | 4; score: number; outside: boolean } | null;

/** GitHub-style grid: columns are weeks (Sunday first), the last column contains endKey; future days are null. */
export function buildHeatmap(scoreByDate: Map<string, number>, endKey: string, weeks = 53, isOutside: (date: string) => boolean = () => false): HeatmapCell[][] {
    const endWeekday = parseDateKey(endKey).getDay();
    const start = addDays(endKey, -(weeks - 1) * 7 - endWeekday);
    const columns: HeatmapCell[][] = [];
    for (let week = 0; week < weeks; week++) {
        const column: HeatmapCell[] = [];
        for (let weekday = 0; weekday < 7; weekday++) {
            const date = addDays(start, week * 7 + weekday);
            if (date > endKey) { column.push(null); continue; }
            const score = scoreByDate.get(date) ?? 0;
            const level = (score <= 0 ? 0 : score >= 4 ? 4 : score) as 0 | 1 | 2 | 3 | 4;
            column.push({ date, level, score, outside: isOutside(date) });
        }
        columns.push(column);
    }
    return columns;
}

export type CategoryWindow = { from?: string; until?: string };

/** Days a category could have been logged: from its start (or first value, if earlier) through its retirement day. */
export function categoryWindow(category: TrackerCategory, entries: TrackerEntry[]): CategoryWindow {
    let first: string | undefined;
    for (const entry of entries) {
        if (entry.metrics[category.key] !== undefined && (!first || entry.date < first)) first = entry.date;
    }
    const from = category.startedOn && first ? (category.startedOn < first ? category.startedOn : first) : category.startedOn ?? first;
    return { from, until: category.retiredOn };
}

export function isOutsideWindow(date: string, window: CategoryWindow): boolean {
    return Boolean((window.from && date < window.from) || (window.until && date > window.until));
}

export type CategoryStats = {
    /** Days in range that fall inside the category's lifetime. */
    days: number;
    activeDays: number;
    activeDates: string[];
    currentStreak: number;
    longestStreak: number;
    total: number;
    average: number;
    best: number;
    goalDays: number;
    series: { date: string; value: number; outside: boolean }[];
};

export function categoryStats(category: TrackerCategory, entriesByDate: Map<string, TrackerEntry>, startKey: string, endKey: string, window: CategoryWindow = {}): CategoryStats {
    const series: CategoryStats['series'] = [];
    for (let date = startKey; date <= endKey; date = addDays(date, 1)) {
        const value = entriesByDate.get(date)?.metrics[category.key];
        series.push({ date, value: typeof value === 'number' ? value : value === true ? 1 : 0, outside: isOutsideWindow(date, window) });
    }

    const inside = series.filter((point) => !point.outside);
    const active = inside.filter((point) => point.value > 0);
    let longestStreak = 0;
    let run = 0;
    for (const point of inside) {
        run = point.value > 0 ? run + 1 : 0;
        longestStreak = Math.max(longestStreak, run);
    }
    // A streak is still "current" if today simply hasn't been logged yet; retired categories have none.
    let currentStreak = 0;
    if (isActiveCategory(category)) {
        let index = inside.length - 1;
        if (index >= 0 && inside[index].value <= 0) index--;
        while (index >= 0 && inside[index].value > 0) { currentStreak++; index--; }
    }

    const total = active.reduce((sum, point) => sum + point.value, 0);
    return {
        days: inside.length,
        activeDays: active.length,
        activeDates: active.map((point) => point.date),
        currentStreak,
        longestStreak,
        total,
        average: active.length ? total / active.length : 0,
        best: active.reduce((max, point) => Math.max(max, point.value), 0),
        goalDays: category.goal ? active.filter((point) => point.value >= category.goal!).length : 0,
        series,
    };
}

// ---------- input validation ----------

export class TrackerInputError extends Error {}

export function slugify(name: string): string {
    return name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40);
}

/** Keys are never reused, so a renamed/retyped category's history can't merge into a new one. */
export function uniqueKey(base: string, existingKeys: Iterable<string>): string {
    const taken = new Set(existingKeys);
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) suffix++;
    return `${base}-${suffix}`;
}

/** Goal tweaks keep the category; anything that changes what the numbers mean starts a new one. */
export function categoryEditMode(existing: TrackerCategory, next: Pick<TrackerCategory, 'name' | 'type' | 'unit'>): 'in-place' | 'replace' {
    const same = existing.name === next.name && existing.type === next.type && (existing.unit ?? '') === (next.unit ?? '');
    return same ? 'in-place' : 'replace';
}

export function sanitizeCategoryInput(body: any): Pick<TrackerCategory, 'name' | 'type' | 'unit' | 'goal'> {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 40) throw new TrackerInputError('Category name must be 1-40 characters');
    if (!slugify(name)) throw new TrackerInputError('Category name needs at least one letter or digit');
    const type: CategoryType = body?.type === 'amount' ? 'amount' : 'boolean';
    const unit = type === 'amount' && typeof body?.unit === 'string' && body.unit.trim() ? body.unit.trim().slice(0, 20) : undefined;
    const goalNumber = Number(body?.goal);
    const goal = type === 'amount' && Number.isFinite(goalNumber) && goalNumber > 0 ? goalNumber : undefined;
    return { name, type, ...(unit ? { unit } : {}), ...(goal ? { goal } : {}) };
}

export function sanitizeEntryInput(body: any, categories: TrackerCategory[]): { date: string; notes: string; metrics: Record<string, MetricValue> } {
    if (!isDateKey(body?.date)) throw new TrackerInputError('date must be YYYY-MM-DD');
    const notes = typeof body?.notes === 'string' ? body.notes : '';
    if (notes.length > 20_000) throw new TrackerInputError('Notes are limited to 20,000 characters');

    const metrics: Record<string, MetricValue> = {};
    const raw = body?.metrics && typeof body.metrics === 'object' ? body.metrics : {};
    for (const category of categories) {
        const value = raw[category.key];
        if (value === undefined || value === null || value === '') continue;
        if (category.type === 'boolean') {
            if (value === true) metrics[category.key] = true;
        } else {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) throw new TrackerInputError(`${category.name} must be a non-negative number`);
            if (amount > 0) metrics[category.key] = amount;
        }
    }
    return { date: body.date, notes, metrics };
}

export function sanitizeTodoInput(body: any): { title: string; kind: TodoKind; tier: 1 | 2 } {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 200) throw new TrackerInputError('To-do title must be 1-200 characters');
    return { title, kind: body?.kind === 'longterm' ? 'longterm' : 'regular', tier: body?.tier === 1 ? 1 : 2 };
}
