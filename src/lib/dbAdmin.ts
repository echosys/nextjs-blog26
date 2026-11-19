import getMongoClientPromise from './mongodb';
import { pgDb } from './pg';
import runtimeConfig from './runtimeConfig';
import { readJsonDocument } from './storage';

/** Which App Hub app owns each collection/table; anything else in a shared database is someone else's. */
export function getSchemaOwners(): { mongo: Record<string, string>; postgres: Record<string, string> } {
    const { mongo, postgres, tracker, ops } = runtimeConfig;
    return {
        mongo: {
            [mongo.loginCollection]: 'Blog · login & tag cache',
            [mongo.blogCollection]: 'Blog · Mongo posts',
            [tracker.entriesCollection]: 'Tracker · journal entries',
            [tracker.categoriesCollection]: 'Tracker · categories',
            [tracker.todosCollection]: 'Tracker · to-dos',
            [ops.keepAliveRunsCollection]: 'Settings · keep-alive log',
            [ops.loginAttemptsCollection]: 'Auth · login attempts',
        },
        postgres: {
            [postgres.blogTable]: 'Blog · Postgres posts',
            [postgres.attachmentTable]: 'Blog · attachment & image chunks',
        },
    };
}

type MockSchema = {
    mongo?: { database: string; collections: MongoCollectionSchema[] };
    postgres?: { schema: string; tables: PostgresTableSchema[] };
};

/** Hand-written sample schema for local runs where no real database is configured. */
export async function getMockSchema(): Promise<MockSchema> {
    return readJsonDocument<MockSchema>(runtimeConfig.json.mockSchemaFile, {});
}

export type ProbeResult = {
    backend: 'mongo' | 'postgres';
    configured: boolean;
    ok: boolean;
    ms?: number;
    message?: string;
};

async function timed(backend: ProbeResult['backend'], configured: boolean, run: () => Promise<unknown>): Promise<ProbeResult> {
    if (!configured) return { backend, configured, ok: false, message: 'Not configured' };
    const started = Date.now();
    try {
        await run();
        return { backend, configured, ok: true, ms: Date.now() - started };
    } catch (error: any) {
        return { backend, configured, ok: false, ms: Date.now() - started, message: error?.message ?? 'Failed' };
    }
}

function quoteIdentifier(name: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
    return `"${name}"`;
}

/** Read one row from each configured database; a real read counts as activity for free-tier auto-pause. */
export async function runKeepAlive(): Promise<ProbeResult[]> {
    return Promise.all([
        timed('mongo', Boolean(process.env.MONGODB_URI), async () => {
            const client = await getMongoClientPromise();
            await client.db(runtimeConfig.mongo.databaseName)
                .collection(runtimeConfig.mongo.blogCollection)
                .findOne({}, { projection: { _id: 1 } });
        }),
        timed('postgres', Boolean(process.env.POSTGRES_URL), async () => {
            const exists = await pgDb.query('SELECT to_regclass($1) AS name', [`public.${runtimeConfig.postgres.blogTable}`]);
            await pgDb.query(exists.rows[0]?.name
                ? `SELECT id FROM ${quoteIdentifier(runtimeConfig.postgres.blogTable)} LIMIT 1`
                : 'SELECT 1');
        }),
    ]);
}

export type MongoCollectionSchema = {
    name: string;
    estimatedCount: number;
    fields: { name: string; types: string[]; seenIn: number }[];
    sampled: number;
    indexes: string[];
};

export async function getMongoSchema(): Promise<{ database: string; collections: MongoCollectionSchema[] }> {
    const database = runtimeConfig.mongo.databaseName;
    const db = (await getMongoClientPromise()).db(database);
    const collections = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();

    const result = await Promise.all(collections.map(async ({ name }) => {
        const collection = db.collection(name);
        // Field names/types are computed inside MongoDB so document bodies (and base64 blobs) never leave the server.
        const [estimatedCount, fieldRows, indexes] = await Promise.all([
            collection.estimatedDocumentCount(),
            collection.aggregate<{ _id: string; types: string[]; seenIn: number }>([
                { $sample: { size: 25 } },
                { $project: { kv: { $objectToArray: '$$ROOT' } } },
                { $unwind: '$kv' },
                { $group: { _id: '$kv.k', types: { $addToSet: { $type: '$kv.v' } }, seenIn: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]).toArray(),
            collection.listIndexes().toArray(),
        ]);
        const sampled = Math.min(estimatedCount, 25);
        return {
            name,
            estimatedCount,
            sampled,
            fields: fieldRows.map((row) => ({ name: row._id, types: [...row.types].sort(), seenIn: row.seenIn })),
            indexes: indexes.map((index) => String(index.name)),
        };
    }));

    return { database, collections: result.sort((a, b) => a.name.localeCompare(b.name)) };
}

export type PostgresTableSchema = {
    name: string;
    estimatedRows: number | null;
    columns: { name: string; type: string; nullable: boolean; defaultValue: string | null }[];
    indexes: string[];
};

export async function getPostgresSchema(): Promise<{ schema: string; tables: PostgresTableSchema[] }> {
    const [columns, counts, indexes] = await Promise.all([
        pgDb.query(`
            SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
            WHERE c.table_schema = 'public'
            ORDER BY c.table_name, c.ordinal_position
        `),
        pgDb.query(`
            SELECT c.relname AS table_name, c.reltuples::bigint AS estimate
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        `),
        pgDb.query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`),
    ]);

    const tables = new Map<string, PostgresTableSchema>();
    for (const row of columns.rows) {
        const table: PostgresTableSchema = tables.get(row.table_name) ?? { name: row.table_name, estimatedRows: null, columns: [], indexes: [] };
        table.columns.push({
            name: row.column_name,
            type: row.data_type === 'ARRAY' ? `${String(row.udt_name).replace(/^_/, '')}[]` : row.data_type,
            nullable: row.is_nullable === 'YES',
            defaultValue: row.column_default,
        });
        tables.set(row.table_name, table);
    }
    for (const row of counts.rows) {
        const table = tables.get(row.table_name);
        // reltuples is -1 until the table has been analyzed.
        if (table) table.estimatedRows = Number(row.estimate) >= 0 ? Number(row.estimate) : null;
    }
    for (const row of indexes.rows) {
        tables.get(row.tablename)?.indexes.push(row.indexname);
    }

    return { schema: 'public', tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}
