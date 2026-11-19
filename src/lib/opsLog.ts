import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
import getMongoClientPromise from './mongodb';
import runtimeConfig, { getRuntimeStorageConfig } from './runtimeConfig';
import { readJsonDocument, writeJsonDocument } from './storage';
import { logError } from './logger';
import type { ProbeResult } from './dbAdmin';

// Operational audit records: keep-alive runs and login attempts (JSON locally, MongoDB in deploy).

export const KEEPALIVE_SOURCES = ['cron', 'login-page', 'settings', 'api'] as const;
export type KeepAliveSource = (typeof KEEPALIVE_SOURCES)[number];

export type KeepAliveRun = { id: string; at: string; source: KeepAliveSource; results: ProbeResult[] };

export type LoginOutcome = 'success' | 'invalid-credentials' | 'invalid-input' | 'error';
export type LoginAttempt = { id: string; at: string; login: string; success: boolean; outcome: LoginOutcome; ip: string; userAgent: string };

type OpsFile = { keepAliveRuns: KeepAliveRun[]; loginAttempts: LoginAttempt[] };
type HeaderBag = Record<string, string | string[] | undefined>;

const settings = runtimeConfig.ops;

function firstHeader(headers: HeaderBag, name: string): string {
    const value = headers[name];
    return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Vercel cron requests carry a `vercel-cron/*` user agent; UI callers tag themselves with `?source=`. */
export function resolveKeepAliveSource(headers: HeaderBag, querySource: unknown): KeepAliveSource {
    if (firstHeader(headers, 'user-agent').startsWith('vercel-cron')) return 'cron';
    return typeof querySource === 'string' && (KEEPALIVE_SOURCES as readonly string[]).includes(querySource) && querySource !== 'cron'
        ? querySource as KeepAliveSource
        : 'api';
}

/** Client IP as reported by the platform proxy (Vercel sets x-forwarded-for); falls back to the socket address. */
export function clientIp(headers: HeaderBag, remoteAddress?: string): string {
    const forwarded = firstHeader(headers, 'x-forwarded-for').split(',')[0].trim();
    const ip = forwarded || firstHeader(headers, 'x-real-ip').trim() || remoteAddress || 'unknown';
    return ip.replace(/^::ffff:/, '').slice(0, 64);
}

function useJson(host?: string | null) {
    return getRuntimeStorageConfig(host).opsMode === 'json';
}

function cutoffMs() {
    return Date.now() - settings.retentionDays * 86_400_000;
}

async function readFile(): Promise<OpsFile> {
    const file = await readJsonDocument<Partial<OpsFile>>(runtimeConfig.json.opsFile, {});
    return { keepAliveRuns: file.keepAliveRuns ?? [], loginAttempts: file.loginAttempts ?? [] };
}

async function appendJson<K extends keyof OpsFile>(key: K, record: OpsFile[K][number]) {
    const data = await readFile();
    const cutoff = cutoffMs();
    (data[key] as OpsFile[K][number][]) = [record, ...data[key].filter((item) => Date.parse(item.at) >= cutoff)] as OpsFile[K][number][];
    await writeJsonDocument(runtimeConfig.json.opsFile, data);
}

let mongoReady: Promise<Db> | null = null;

function getDb(): Promise<Db> {
    if (!mongoReady) {
        mongoReady = (async () => {
            const db = (await getMongoClientPromise()).db(runtimeConfig.mongo.databaseName);
            // TTL index both expires old records and serves "newest first" queries.
            const ttl = { expireAfterSeconds: settings.retentionDays * 86_400 };
            await Promise.all([
                db.collection(settings.keepAliveRunsCollection).createIndex({ at: 1 }, ttl),
                db.collection(settings.loginAttemptsCollection).createIndex({ at: 1 }, ttl),
            ]);
            return db;
        })();
        mongoReady.catch(() => { mongoReady = null; });
    }
    return mongoReady;
}

function fromDoc<T extends { id: string; at: string }>(doc: any): T {
    const { _id, at, ...rest } = doc;
    return { ...rest, id: String(_id), at: at instanceof Date ? at.toISOString() : String(at) } as T;
}

async function insertMongo(collection: string, record: { at: string } & Record<string, unknown>) {
    const { at, ...rest } = record;
    await (await getDb()).collection(collection).insertOne({ ...rest, at: new Date(at) });
}

async function listMongo<T extends { id: string; at: string }>(collection: string, limit: number): Promise<T[]> {
    const docs = await (await getDb()).collection(collection).find().sort({ at: -1 }).limit(limit).toArray();
    return docs.map((doc) => fromDoc<T>(doc));
}

/** Never throws: an audit failure must not break keep-alive or login. */
export async function recordKeepAliveRun(host: string | null | undefined, source: KeepAliveSource, results: ProbeResult[]): Promise<void> {
    const run: KeepAliveRun = { id: randomUUID(), at: new Date().toISOString(), source, results };
    try {
        if (useJson(host)) await appendJson('keepAliveRuns', run);
        else await insertMongo(settings.keepAliveRunsCollection, { at: run.at, source, results });
    } catch (error: any) {
        await logError('ops.keepalive', 'Failed to record keep-alive run', { source, message: error?.message });
    }
}

export async function recordLoginAttempt(host: string | null | undefined, attempt: Omit<LoginAttempt, 'id' | 'at'>): Promise<void> {
    const record: LoginAttempt = { ...attempt, id: randomUUID(), at: new Date().toISOString(), login: attempt.login.slice(0, 200), userAgent: attempt.userAgent.slice(0, 300) };
    try {
        if (useJson(host)) await appendJson('loginAttempts', record);
        else {
            const { id: _id, ...rest } = record;
            await insertMongo(settings.loginAttemptsCollection, rest);
        }
    } catch (error: any) {
        await logError('ops.login', 'Failed to record login attempt', { outcome: attempt.outcome, message: error?.message });
    }
}

export async function listKeepAliveRuns(host?: string | null, limit = settings.recentListLimit): Promise<KeepAliveRun[]> {
    if (useJson(host)) return (await readFile()).keepAliveRuns.slice(0, limit);
    return listMongo<KeepAliveRun>(settings.keepAliveRunsCollection, limit);
}

export async function listLoginAttempts(host?: string | null, limit = settings.recentListLimit): Promise<LoginAttempt[]> {
    if (useJson(host)) return (await readFile()).loginAttempts.slice(0, limit);
    return listMongo<LoginAttempt>(settings.loginAttemptsCollection, limit);
}
