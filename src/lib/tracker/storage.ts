import { randomUUID } from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import getMongoClientPromise from '../mongodb';
import runtimeConfig, { getRuntimeStorageConfig } from '../runtimeConfig';
import { readJsonDocument, writeJsonDocument } from '../storage';
import { logInfo } from '../logger';
import {
    categoryEditMode,
    isActiveCategory,
    slugify,
    TrackerInputError,
    uniqueKey,
    type MetricValue,
    type TrackerCategory,
    type TrackerEntry,
    type TrackerTodo,
} from './model';

type TrackerFile = { categories: TrackerCategory[]; entries: TrackerEntry[]; todos: TrackerTodo[] };

const settings = runtimeConfig.tracker;

function useJson(host?: string | null) {
    return getRuntimeStorageConfig(host).trackerMode === 'json';
}

function seedCategories(): TrackerCategory[] {
    const createdAt = new Date().toISOString();
    return settings.defaultCategories.map((seed) => ({ ...seed, id: randomUUID(), createdAt }));
}

// ---------- JSON adapter ----------

async function readFile(): Promise<TrackerFile> {
    const file = await readJsonDocument<Partial<TrackerFile>>(runtimeConfig.json.trackerFile, {});
    const data: TrackerFile = { categories: file.categories ?? [], entries: file.entries ?? [], todos: file.todos ?? [] };
    if (!file.categories) {
        data.categories = seedCategories();
        await writeFile(data);
    }
    return data;
}

async function writeFile(data: TrackerFile) {
    await writeJsonDocument(runtimeConfig.json.trackerFile, data);
}

// ---------- Mongo adapter ----------

let mongoReady: Promise<Db> | null = null;

function getDb(): Promise<Db> {
    if (!mongoReady) {
        mongoReady = (async () => {
            const db = (await getMongoClientPromise()).db(runtimeConfig.mongo.databaseName);
            await Promise.all([
                db.collection(settings.entriesCollection).createIndex({ date: 1 }, { unique: true }),
                db.collection(settings.categoriesCollection).createIndex({ key: 1 }, { unique: true }),
                db.collection(settings.todosCollection).createIndex({ kind: 1, doneAt: 1, dueAt: 1 }),
            ]);
            const categories = db.collection(settings.categoriesCollection);
            if ((await categories.estimatedDocumentCount()) === 0) {
                await categories.insertMany(settings.defaultCategories.map((seed) => ({ ...seed, createdAt: new Date() })));
            }
            return db;
        })();
        mongoReady.catch(() => { mongoReady = null; });
    }
    return mongoReady;
}

function iso(value: unknown): string | undefined {
    if (value instanceof Date) return value.toISOString();
    return typeof value === 'string' ? value : undefined;
}

function toCategory(doc: any): TrackerCategory {
    return {
        id: String(doc._id),
        key: doc.key,
        name: doc.name,
        type: doc.type,
        unit: doc.unit,
        goal: doc.goal,
        createdAt: iso(doc.createdAt) ?? '',
        startedOn: doc.startedOn,
        retiredOn: doc.retiredOn,
        replacedBy: doc.replacedBy,
    };
}

function toEntry(doc: any): TrackerEntry {
    return { id: String(doc._id), date: doc.date, notes: doc.notes ?? '', metrics: doc.metrics ?? {}, createdAt: iso(doc.createdAt) ?? '', updatedAt: iso(doc.updatedAt) };
}

function toTodo(doc: any): TrackerTodo {
    return {
        id: String(doc._id),
        title: doc.title,
        kind: doc.kind,
        tier: doc.tier === 1 ? 1 : 2,
        createdAt: iso(doc.createdAt) ?? '',
        dueAt: iso(doc.dueAt),
        doneAt: iso(doc.doneAt),
        doneDate: doc.doneDate,
    };
}

function objectId(id: string) {
    if (!ObjectId.isValid(id)) throw new TrackerInputError('Invalid id');
    return new ObjectId(id);
}

// ---------- categories ----------
// Categories are append-only: they are retired, never deleted, so entry metrics always keep their meaning.

export type CategoryInput = Pick<TrackerCategory, 'name' | 'type' | 'unit' | 'goal'>;

export async function listCategories(host?: string | null): Promise<TrackerCategory[]> {
    if (useJson(host)) return (await readFile()).categories;
    const docs = await (await getDb()).collection(settings.categoriesCollection).find().sort({ createdAt: 1 }).toArray();
    return docs.map(toCategory);
}

function assertNameFree(categories: TrackerCategory[], name: string, exceptKey?: string) {
    const clash = categories.find((category) => isActiveCategory(category) && category.key !== exceptKey && category.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new TrackerInputError(`An active category named "${clash.name}" already exists`);
}

function newCategory(input: CategoryInput, existing: TrackerCategory[], today: string): Omit<TrackerCategory, 'id' | 'createdAt'> {
    const key = uniqueKey(slugify(input.name), existing.map((category) => category.key));
    return { ...input, key, startedOn: today };
}

async function insertCategory(host: string | null | undefined, category: Omit<TrackerCategory, 'id' | 'createdAt'>): Promise<TrackerCategory> {
    if (useJson(host)) {
        const data = await readFile();
        const created: TrackerCategory = { ...category, id: randomUUID(), createdAt: new Date().toISOString() };
        data.categories.push(created);
        await writeFile(data);
        return created;
    }
    const doc = { ...category, createdAt: new Date() };
    const result = await (await getDb()).collection(settings.categoriesCollection).insertOne(doc);
    return toCategory({ ...doc, _id: result.insertedId });
}

async function setCategoryFields(host: string | null | undefined, key: string, set: Partial<TrackerCategory>, unset: (keyof TrackerCategory)[] = []) {
    if (useJson(host)) {
        const data = await readFile();
        const category = data.categories.find((item) => item.key === key);
        if (!category) throw new TrackerInputError('Category not found');
        Object.assign(category, set);
        for (const field of unset) delete category[field];
        await writeFile(data);
        return;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (unset.length) update.$unset = Object.fromEntries(unset.map((field) => [field, '']));
    const result = await (await getDb()).collection(settings.categoriesCollection).updateOne({ key }, update);
    if (!result.matchedCount) throw new TrackerInputError('Category not found');
}

export async function createCategory(host: string | null | undefined, input: CategoryInput, today: string): Promise<TrackerCategory> {
    const categories = await listCategories(host);
    assertNameFree(categories, input.name);
    const created = await insertCategory(host, newCategory(input, categories, today));
    await logInfo('tracker.category', 'Created category', { key: created.key, type: created.type });
    return created;
}

/**
 * Goal-only edits update in place. Renaming or changing type/unit retires the old category as of `today`
 * and starts a new one, so past values are never relabelled or reinterpreted.
 */
export async function updateCategory(host: string | null | undefined, key: string, input: CategoryInput, today: string): Promise<TrackerCategory> {
    const categories = await listCategories(host);
    const existing = categories.find((category) => category.key === key);
    if (!existing) throw new TrackerInputError('Category not found');
    if (!isActiveCategory(existing)) throw new TrackerInputError('Retired categories are read-only; restore it first');

    if (categoryEditMode(existing, input) === 'in-place') {
        await setCategoryFields(host, key, input.goal ? { goal: input.goal } : {}, input.goal ? [] : ['goal']);
        await logInfo('tracker.category', 'Updated category goal', { key, goal: input.goal ?? null });
        return { ...existing, goal: input.goal };
    }

    assertNameFree(categories, input.name, key);
    const replacement = await insertCategory(host, newCategory(input, categories, today));
    await setCategoryFields(host, key, { retiredOn: today, replacedBy: replacement.key });
    await logInfo('tracker.category', 'Replaced category', { from: key, to: replacement.key, retiredOn: today });
    return replacement;
}

/** "Delete" retires the category; its values stay in old entries and remain available in analytics. */
export async function retireCategory(host: string | null | undefined, key: string, today: string): Promise<void> {
    await setCategoryFields(host, key, { retiredOn: today });
    await logInfo('tracker.category', 'Retired category', { key, retiredOn: today });
}

export async function restoreCategory(host: string | null | undefined, key: string): Promise<void> {
    const categories = await listCategories(host);
    const category = categories.find((item) => item.key === key);
    if (!category) throw new TrackerInputError('Category not found');
    assertNameFree(categories, category.name, key);
    await setCategoryFields(host, key, {}, ['retiredOn', 'replacedBy']);
    await logInfo('tracker.category', 'Restored category', { key });
}

// ---------- entries ----------

export async function listEntries(host?: string | null): Promise<TrackerEntry[]> {
    if (useJson(host)) return [...(await readFile()).entries].sort((a, b) => b.date.localeCompare(a.date));
    const docs = await (await getDb()).collection(settings.entriesCollection).find().sort({ date: -1 }).toArray();
    return docs.map(toEntry);
}

/**
 * Only `editableKeys` (active categories) are replaced; values for retired categories are kept as history.
 * Saving an entry left with no notes and no metrics removes it, so "tracked days" only lists days with content.
 */
export async function saveEntry(
    host: string | null | undefined,
    input: { date: string; notes: string; metrics: Record<string, MetricValue> },
    editableKeys: Set<string>,
): Promise<TrackerEntry | null> {
    const now = new Date();
    const merge = (previous: Record<string, MetricValue> | undefined) => ({
        ...Object.fromEntries(Object.entries(previous ?? {}).filter(([key]) => !editableKeys.has(key))),
        ...input.metrics,
    });

    if (useJson(host)) {
        const data = await readFile();
        const existing = data.entries.find((entry) => entry.date === input.date);
        const metrics = merge(existing?.metrics);
        data.entries = data.entries.filter((entry) => entry.date !== input.date);
        let saved: TrackerEntry | null = null;
        if (input.notes.trim() || Object.keys(metrics).length) {
            saved = {
                id: existing?.id ?? randomUUID(),
                date: input.date,
                notes: input.notes,
                metrics,
                createdAt: existing?.createdAt ?? now.toISOString(),
                ...(existing ? { updatedAt: now.toISOString() } : {}),
            };
            data.entries.push(saved);
        }
        await writeFile(data);
        await logInfo('tracker.entry', saved ? 'Saved entry' : 'Cleared entry', { date: input.date, metrics: Object.keys(metrics).length });
        return saved;
    }

    const collection = (await getDb()).collection(settings.entriesCollection);
    const metrics = merge((await collection.findOne({ date: input.date }, { projection: { metrics: 1 } }))?.metrics);
    if (!input.notes.trim() && Object.keys(metrics).length === 0) {
        await collection.deleteOne({ date: input.date });
        await logInfo('tracker.entry', 'Cleared entry', { date: input.date });
        return null;
    }
    const doc = await collection.findOneAndUpdate(
        { date: input.date },
        { $set: { notes: input.notes, metrics, updatedAt: now }, $setOnInsert: { date: input.date, createdAt: now } },
        { upsert: true, returnDocument: 'after' },
    );
    return doc ? toEntry(doc) : null;
}

// ---------- to-dos ----------

export async function listTodos(host?: string | null): Promise<TrackerTodo[]> {
    if (useJson(host)) return (await readFile()).todos;
    const docs = await (await getDb()).collection(settings.todosCollection).find().sort({ createdAt: -1 }).limit(5000).toArray();
    return docs.map(toTodo);
}

function regularDueAt(from: Date): Date {
    return new Date(from.getTime() + settings.regularTodoWindowDays * 86_400_000);
}

export async function createTodo(host: string | null | undefined, input: { title: string; kind: TrackerTodo['kind']; tier: 1 | 2 }): Promise<TrackerTodo> {
    const now = new Date();
    const fields = { ...input, createdAt: now, ...(input.kind === 'regular' ? { dueAt: regularDueAt(now) } : {}) };

    let todo: TrackerTodo;
    if (useJson(host)) {
        const data = await readFile();
        todo = toTodo({ ...fields, _id: randomUUID() });
        data.todos.push(todo);
        await writeFile(data);
    } else {
        const result = await (await getDb()).collection(settings.todosCollection).insertOne(fields);
        todo = toTodo({ ...fields, _id: result.insertedId });
    }
    await logInfo('tracker.todo', 'Created to-do', { id: todo.id, kind: todo.kind, tier: todo.tier });
    return todo;
}

export type TodoPatch = {
    done?: boolean;
    doneDate?: string;
    tier?: 1 | 2;
    kind?: TrackerTodo['kind'];
    /** Restart the visibility window of a regular to-do. */
    revive?: boolean;
};

export async function updateTodo(host: string | null | undefined, id: string, patch: TodoPatch): Promise<void> {
    const now = new Date();
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    if (patch.done === true) { set.doneAt = now; set.doneDate = patch.doneDate; }
    if (patch.done === false) { unset.doneAt = ''; unset.doneDate = ''; }
    if (patch.tier) set.tier = patch.tier;
    if (patch.kind === 'longterm') { set.kind = 'longterm'; unset.dueAt = ''; }
    if (patch.kind === 'regular' || patch.revive) { set.kind = 'regular'; set.dueAt = regularDueAt(now); }

    if (useJson(host)) {
        const data = await readFile();
        const todo = data.todos.find((item) => item.id === id);
        if (!todo) throw new TrackerInputError('To-do not found');
        for (const key of Object.keys(unset)) delete (todo as any)[key];
        for (const [key, value] of Object.entries(set)) (todo as any)[key] = value instanceof Date ? value.toISOString() : value;
        await writeFile(data);
        await logInfo('tracker.todo', 'Updated to-do', { id, ...patch });
        return;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (!Object.keys(update).length) return;
    const result = await (await getDb()).collection(settings.todosCollection).updateOne({ _id: objectId(id) }, update);
    if (!result.matchedCount) throw new TrackerInputError('To-do not found');
    await logInfo('tracker.todo', 'Updated to-do', { id, ...patch });
}

export async function deleteTodo(host: string | null | undefined, id: string): Promise<void> {
    if (useJson(host)) {
        const data = await readFile();
        data.todos = data.todos.filter((todo) => todo.id !== id);
        await writeFile(data);
    } else {
        await (await getDb()).collection(settings.todosCollection).deleteOne({ _id: objectId(id) });
    }
    await logInfo('tracker.todo', 'Deleted to-do', { id });
}

export function trackerSettings() {
    return {
        regularTodoWindowDays: settings.regularTodoWindowDays,
        activeTodoLimit: settings.activeTodoLimit,
        analyticsRangesDays: [...settings.analyticsRangesDays],
        heatmapWeeks: settings.heatmapWeeks,
    };
}

export type TrackerSettings = ReturnType<typeof trackerSettings>;
