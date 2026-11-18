import { randomUUID } from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import getMongoClientPromise from '../mongodb';
import runtimeConfig, { getRuntimeStorageConfig } from '../runtimeConfig';
import { readJsonDocument, writeJsonDocument } from '../storage';
import {
    TrackerInputError,
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
    return { id: String(doc._id), key: doc.key, name: doc.name, type: doc.type, unit: doc.unit, goal: doc.goal, createdAt: iso(doc.createdAt) ?? '' };
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

export async function listCategories(host?: string | null): Promise<TrackerCategory[]> {
    if (useJson(host)) return (await readFile()).categories;
    const docs = await (await getDb()).collection(settings.categoriesCollection).find().sort({ createdAt: 1 }).toArray();
    return docs.map(toCategory);
}

export async function createCategory(host: string | null | undefined, input: Omit<TrackerCategory, 'id' | 'createdAt'>): Promise<TrackerCategory> {
    if (useJson(host)) {
        const data = await readFile();
        if (data.categories.some((category) => category.key === input.key)) throw new TrackerInputError(`Category "${input.name}" already exists`);
        const category: TrackerCategory = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
        data.categories.push(category);
        await writeFile(data);
        return category;
    }
    const collection = (await getDb()).collection(settings.categoriesCollection);
    try {
        const doc = { ...input, createdAt: new Date() };
        const result = await collection.insertOne(doc);
        return toCategory({ ...doc, _id: result.insertedId });
    } catch (error: any) {
        if (error?.code === 11000) throw new TrackerInputError(`Category "${input.name}" already exists`);
        throw error;
    }
}

/** Entries keep their stored values; they just stop being shown for this category. */
export async function deleteCategory(host: string | null | undefined, key: string): Promise<void> {
    if (useJson(host)) {
        const data = await readFile();
        data.categories = data.categories.filter((category) => category.key !== key);
        await writeFile(data);
        return;
    }
    await (await getDb()).collection(settings.categoriesCollection).deleteOne({ key });
}

// ---------- entries ----------

export async function listEntries(host?: string | null): Promise<TrackerEntry[]> {
    if (useJson(host)) return [...(await readFile()).entries].sort((a, b) => b.date.localeCompare(a.date));
    const docs = await (await getDb()).collection(settings.entriesCollection).find().sort({ date: -1 }).toArray();
    return docs.map(toEntry);
}

/** Saving an entry with no notes and no metrics removes it, so "tracked days" only lists days with content. */
export async function saveEntry(host: string | null | undefined, input: { date: string; notes: string; metrics: Record<string, MetricValue> }): Promise<TrackerEntry | null> {
    const isEmpty = !input.notes.trim() && Object.keys(input.metrics).length === 0;
    const now = new Date();

    if (useJson(host)) {
        const data = await readFile();
        const existing = data.entries.find((entry) => entry.date === input.date);
        data.entries = data.entries.filter((entry) => entry.date !== input.date);
        let saved: TrackerEntry | null = null;
        if (!isEmpty) {
            saved = {
                id: existing?.id ?? randomUUID(),
                ...input,
                createdAt: existing?.createdAt ?? now.toISOString(),
                ...(existing ? { updatedAt: now.toISOString() } : {}),
            };
            data.entries.push(saved);
        }
        await writeFile(data);
        return saved;
    }

    const collection = (await getDb()).collection(settings.entriesCollection);
    if (isEmpty) {
        await collection.deleteOne({ date: input.date });
        return null;
    }
    const doc = await collection.findOneAndUpdate(
        { date: input.date },
        { $set: { notes: input.notes, metrics: input.metrics, updatedAt: now }, $setOnInsert: { date: input.date, createdAt: now } },
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

    if (useJson(host)) {
        const data = await readFile();
        const todo = toTodo({ ...fields, _id: randomUUID() });
        data.todos.push(todo);
        await writeFile(data);
        return todo;
    }
    const result = await (await getDb()).collection(settings.todosCollection).insertOne(fields);
    return toTodo({ ...fields, _id: result.insertedId });
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
        return;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (!Object.keys(update).length) return;
    const result = await (await getDb()).collection(settings.todosCollection).updateOne({ _id: objectId(id) }, update);
    if (!result.matchedCount) throw new TrackerInputError('To-do not found');
}

export async function deleteTodo(host: string | null | undefined, id: string): Promise<void> {
    if (useJson(host)) {
        const data = await readFile();
        data.todos = data.todos.filter((todo) => todo.id !== id);
        await writeFile(data);
        return;
    }
    await (await getDb()).collection(settings.todosCollection).deleteOne({ _id: objectId(id) });
}

export function trackerSettings() {
    return { regularTodoWindowDays: settings.regularTodoWindowDays, activeTodoLimit: settings.activeTodoLimit };
}
