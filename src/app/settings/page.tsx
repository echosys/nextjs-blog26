import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Activity, Database, KeyRound, ShieldCheck, Table2 } from "lucide-react";
import KeepAliveRunButton from "./KeepAliveRunButton";
import LocalTime from "../components/LocalTime";
import { listKeepAliveRuns, listLoginAttempts, type KeepAliveRun } from "../../lib/opsLog";
import vercelConfig from "../../../vercel.json";
import runtimeConfig, { getRuntimeStorageConfig, isKeepAliveEnabled } from "../../lib/runtimeConfig";
import { getMockSchema, getMongoSchema, getPostgresSchema, getSchemaOwners } from "../../lib/dbAdmin";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Section({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: React.ReactNode }) {
    return (
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Icon size={18} className="text-teal-400" /> {title}</h2>
            {children}
        </section>
    );
}

function Mono({ children }: { children: React.ReactNode }) {
    return <span className="font-mono text-slate-300">{children}</span>;
}

function SchemaError({ message }: { message: string }) {
    return <p className="text-sm text-rose-400">Couldn&apos;t read the schema: {message}</p>;
}

function SchemaLoading() {
    return <p className="text-sm text-slate-500 animate-pulse">Reading schema...</p>;
}

const SOURCE_LABEL: Record<KeepAliveRun["source"], string> = {
    cron: "daily cron",
    "login-page": "login page visit",
    settings: "Settings button",
    api: "direct API call",
};

function ProbeBadges({ run }: { run: KeepAliveRun }) {
    return (
        <span className="flex flex-wrap gap-1.5">
            {run.results.map((result) => (
                <span key={result.backend} title={result.message}
                    className={`text-[11px] px-2 py-0.5 rounded-full ${!result.configured ? "bg-slate-800 text-slate-500" : result.ok ? "bg-teal-500/10 text-teal-300" : "bg-rose-500/10 text-rose-300"}`}>
                    {result.backend} {!result.configured ? "not configured" : result.ok ? `ok ${result.ms} ms` : "failed"}
                </span>
            ))}
        </span>
    );
}

async function KeepAliveHistory({ host }: { host: string | null }) {
    let runs: KeepAliveRun[];
    try {
        runs = await listKeepAliveRuns(host);
    } catch (error: any) {
        return <p className="text-sm text-rose-400">Couldn&apos;t read the keep-alive log: {error?.message}</p>;
    }
    if (runs.length === 0) return <p className="text-sm text-slate-500">No keep-alive runs recorded yet.</p>;
    const [last, ...older] = runs;
    const lastSuccess = runs.find((run) => run.results.every((result) => !result.configured || result.ok));

    return (
        <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 space-y-1">
                <p className="text-slate-300">
                    Last run <span className="text-white font-medium"><LocalTime iso={last.at} withRelative /></span> via <span className="text-white">{SOURCE_LABEL[last.source]}</span>
                </p>
                <ProbeBadges run={last} />
                {lastSuccess && lastSuccess !== last && (
                    <p className="text-xs text-slate-500">Last fully successful run: <LocalTime iso={lastSuccess.at} withRelative /> via {SOURCE_LABEL[lastSuccess.source]}</p>
                )}
            </div>
            {older.length > 0 && (
                <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Previous runs ({older.length})</summary>
                    <ul className="mt-2 space-y-1.5">
                        {older.map((run) => (
                            <li key={run.id} className="flex flex-wrap items-center gap-2 text-slate-400">
                                <span className="w-32 shrink-0"><LocalTime iso={run.at} /></span>
                                <span className="w-32 shrink-0 text-slate-500">{SOURCE_LABEL[run.source]}</span>
                                <ProbeBadges run={run} />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <p className="text-xs text-slate-500">Stored in <Mono>{runtimeConfig.ops.keepAliveRunsCollection}</Mono> for {runtimeConfig.ops.retentionDays} days.</p>
        </div>
    );
}

async function LoginActivity({ host }: { host: string | null }) {
    let attempts;
    try {
        attempts = await listLoginAttempts(host);
    } catch (error: any) {
        return <p className="text-sm text-rose-400">Couldn&apos;t read login activity: {error?.message}</p>;
    }
    if (attempts.length === 0) return <p className="text-sm text-slate-500">No login attempts recorded yet.</p>;
    const dayAgo = Date.now() - 86_400_000;
    const failedToday = attempts.filter((attempt) => !attempt.success && Date.parse(attempt.at) >= dayAgo).length;

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-400">
                Latest {attempts.length} attempts · <span className={failedToday ? "text-amber-300" : "text-slate-400"}>{failedToday} failed in the last 24 h</span>
            </p>
            <div className="border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-950/50 text-slate-500 text-left">
                        <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Result</th><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">IP</th><th className="px-3 py-2 font-medium">Browser</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {attempts.map((attempt) => (
                            <tr key={attempt.id}>
                                <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap"><LocalTime iso={attempt.at} /></td>
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                    {attempt.success
                                        ? <span className="text-teal-400">success</span>
                                        : <span className="text-rose-400">{attempt.outcome.replace("-", " ")}</span>}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-slate-300 truncate max-w-[10rem]" title={attempt.login}>{attempt.login}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-300 whitespace-nowrap">{attempt.ip}</td>
                                <td className="px-3 py-1.5 text-slate-500 truncate max-w-[16rem]" title={attempt.userAgent}>{attempt.userAgent || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">Passwords are never stored. Stored in <Mono>{runtimeConfig.ops.loginAttemptsCollection}</Mono> for {runtimeConfig.ops.retentionDays} days; IPs come from the platform&apos;s <Mono>x-forwarded-for</Mono> header.</p>
        </div>
    );
}

function OwnerBadge({ owner }: { owner?: string }) {
    return owner
        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">Used by {owner}</span>
        : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">Not used by App Hub</span>;
}

function SchemaIntro({ mock, kind, children }: { mock: boolean; kind: "collections" | "tables"; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            {mock && (
                <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    Mock schema: this runtime profile doesn&apos;t use this database, so sample data from <Mono>{runtimeConfig.json.mockSchemaFile}</Mono> is shown.
                </p>
            )}
            <p className="text-xs text-slate-500">
                {children} The database can be shared with other projects: {kind} App Hub uses are labelled; the rest are listed for reference only.
            </p>
        </div>
    );
}

function MissingOwned({ owners, present }: { owners: Record<string, string>; present: string[] }) {
    const missing = Object.entries(owners).filter(([name]) => !present.includes(name));
    if (missing.length === 0) return null;
    return (
        <p className="text-xs text-slate-500">
            Not created yet (created on first use): {missing.map(([name, owner], index) => <span key={name}>{index > 0 && ", "}<Mono>{name}</Mono> ({owner.split(" · ")[0]})</span>)}
        </p>
    );
}

function byOwnership<T extends { name: string }>(items: T[], owners: Record<string, string>): T[] {
    return [...items].sort((a, b) => Number(Boolean(owners[b.name])) - Number(Boolean(owners[a.name])) || a.name.localeCompare(b.name));
}

async function MongoSchemaView({ mock }: { mock: boolean }) {
    if (!mock && !process.env.MONGODB_URI) return <p className="text-sm text-slate-500">MONGODB_URI is not set.</p>;
    let schema;
    try {
        schema = mock ? (await getMockSchema()).mongo : await getMongoSchema();
    } catch (error: any) {
        return <SchemaError message={error?.message ?? "unknown error"} />;
    }
    if (!schema) return <p className="text-sm text-slate-500">No mock Mongo schema in <Mono>{runtimeConfig.json.mockSchemaFile}</Mono>.</p>;
    const owners = getSchemaOwners().mongo;
    if (schema.collections.length === 0) return <p className="text-sm text-slate-500">Database <Mono>{schema.database}</Mono> has no collections yet.</p>;

    return (
        <div className="space-y-4">
            <SchemaIntro mock={mock} kind="collections">Database <Mono>{schema.database}</Mono>. Field types are sampled from up to 25 random documents per collection.</SchemaIntro>
            {byOwnership(schema.collections, owners).map((collection) => (
                <div key={collection.name} className={`border rounded-xl overflow-hidden ${owners[collection.name] ? "border-slate-800" : "border-slate-800/60 opacity-70"}`}>
                    <div className="px-4 py-2 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><span className="font-mono text-sm text-teal-300">{collection.name}</span><OwnerBadge owner={owners[collection.name]} /></span>
                        <span className="text-xs text-slate-500">~{collection.estimatedCount.toLocaleString()} docs · indexes: {collection.indexes.join(", ") || "none"}</span>
                    </div>
                    <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-800/60">
                            {collection.fields.map((field) => (
                                <tr key={field.name}>
                                    <td className="px-4 py-1.5 font-mono text-slate-300 w-1/3">{field.name}</td>
                                    <td className="px-4 py-1.5 text-slate-400">{field.types.join(" | ")}</td>
                                    <td className="px-4 py-1.5 text-slate-600 text-right whitespace-nowrap">in {field.seenIn}/{collection.sampled}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            <MissingOwned owners={owners} present={schema.collections.map((collection) => collection.name)} />
        </div>
    );
}

async function PostgresSchemaView({ mock }: { mock: boolean }) {
    if (!mock && !process.env.POSTGRES_URL) return <p className="text-sm text-slate-500">POSTGRES_URL is not set.</p>;
    let schema;
    try {
        schema = mock ? (await getMockSchema()).postgres : await getPostgresSchema();
    } catch (error: any) {
        return <SchemaError message={error?.message ?? "unknown error"} />;
    }
    if (!schema) return <p className="text-sm text-slate-500">No mock Postgres schema in <Mono>{runtimeConfig.json.mockSchemaFile}</Mono>.</p>;
    const owners = getSchemaOwners().postgres;
    if (schema.tables.length === 0) return <p className="text-sm text-slate-500">Schema <Mono>public</Mono> has no tables yet.</p>;

    return (
        <div className="space-y-4">
            <SchemaIntro mock={mock} kind="tables">Schema <Mono>{schema.schema}</Mono>. Row counts are planner estimates.</SchemaIntro>
            {byOwnership(schema.tables, owners).map((table) => (
                <div key={table.name} className={`border rounded-xl overflow-hidden ${owners[table.name] ? "border-slate-800" : "border-slate-800/60 opacity-70"}`}>
                    <div className="px-4 py-2 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><span className="font-mono text-sm text-teal-300">{table.name}</span><OwnerBadge owner={owners[table.name]} /></span>
                        <span className="text-xs text-slate-500">
                            {table.estimatedRows === null ? "rows: not analyzed yet" : `~${table.estimatedRows.toLocaleString()} rows`} · indexes: {table.indexes.join(", ") || "none"}
                        </span>
                    </div>
                    <table className="w-full text-xs">
                        <tbody className="divide-y divide-slate-800/60">
                            {table.columns.map((column) => (
                                <tr key={column.name}>
                                    <td className="px-4 py-1.5 font-mono text-slate-300 w-1/3">{column.name}</td>
                                    <td className="px-4 py-1.5 text-slate-400">{column.type}{column.nullable ? "" : " not null"}</td>
                                    <td className="px-4 py-1.5 text-slate-600 font-mono truncate max-w-[16rem]" title={column.defaultValue ?? undefined}>{column.defaultValue ?? ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}

export default async function SettingsPage() {
    const host = (await headers()).get("host");
    const storage = getRuntimeStorageConfig(host);
    const keepAliveEnabled = isKeepAliveEnabled();
    const cronSchedule = vercelConfig.crons?.find((cron) => cron.path === "/api/keepalive")?.schedule;
    const usesMongo = storage.loginMode === "mongo" || storage.mongoBlogMode === "mongo" || storage.trackerMode === "mongo" || storage.opsMode === "mongo";
    const usesPostgres = storage.postgresBlogMode === "postgres";

    const envVars = [
        {
            name: "MONGODB_URI",
            purpose: "MongoDB connection string for login, the Mongo blog, the Tracker, and the ops log (when their mode is mongo).",
            required: usesMongo,
        },
        {
            name: "POSTGRES_URL",
            purpose: "Postgres connection string for the PG blog (when its mode is postgres).",
            required: usesPostgres,
        },
        {
            name: "AUTH_SECRET",
            purpose: "Signs login session cookies. Falls back to the DB connection string if unset; changing it logs everyone out.",
            required: false,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                <p className="text-slate-400 text-sm mt-1">
                    Runtime profile <Mono>{storage.runtime}</Mono> · login <Mono>{storage.loginMode}</Mono> · Mongo blog <Mono>{storage.mongoBlogMode}</Mono> · PG blog <Mono>{storage.postgresBlogMode}</Mono> · tracker <Mono>{storage.trackerMode}</Mono> · ops log <Mono>{storage.opsMode}</Mono>
                </p>
            </div>

            <Section icon={Activity} title="Database keep-alive">
                <div className="flex items-start justify-between gap-6">
                    <div className="text-sm text-slate-400 space-y-2">
                        <p>Free-tier databases pause after inactivity (MongoDB Atlas after 30 days without connections, Supabase after about a week). A small read keeps them awake, with no login needed:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>every visit to the login page reads one row from each database</li>
                            <li>a daily Vercel cron calls <Mono>/api/keepalive</Mono>{cronSchedule && <> (<Mono>{cronSchedule}</Mono> UTC)</>}</li>
                        </ul>
                        <p className="text-xs text-slate-500">Controlled by <Mono>keepAlive.enabled</Mono> in <Mono>config/config.json</Mono>.</p>
                    </div>
                    <label className="flex items-center gap-2 shrink-0 cursor-not-allowed" title="Change keepAlive.enabled in config/config.json">
                        <span className={`text-xs font-medium ${keepAliveEnabled ? "text-teal-400" : "text-slate-500"}`}>{keepAliveEnabled ? "On" : "Off"}</span>
                        <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${keepAliveEnabled ? "bg-teal-500/80" : "bg-slate-700"}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${keepAliveEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                        </span>
                        <input type="checkbox" className="sr-only" checked={keepAliveEnabled} disabled readOnly aria-label="Keep-alive enabled (set in config)" />
                    </label>
                </div>
                <KeepAliveRunButton />
                <Suspense fallback={<SchemaLoading />}>
                    <KeepAliveHistory host={host} />
                </Suspense>
            </Section>

            <Section icon={ShieldCheck} title="Login activity">
                <Suspense fallback={<SchemaLoading />}>
                    <LoginActivity host={host} />
                </Suspense>
            </Section>

            <Section icon={KeyRound} title="Environment variables">
                <p className="text-sm text-slate-400">Set these in Vercel (Project → Settings → Environment Variables) or in <Mono>.env.local</Mono> for local runs. Values are never shown here.</p>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-800">
                            {envVars.map((envVar) => {
                                const isSet = Boolean(process.env[envVar.name]);
                                return (
                                    <tr key={envVar.name}>
                                        <td className="px-4 py-2.5 font-mono text-slate-200 align-top whitespace-nowrap">{envVar.name}</td>
                                        <td className="px-4 py-2.5 text-slate-400">{envVar.purpose}</td>
                                        <td className="px-4 py-2.5 text-right align-top whitespace-nowrap">
                                            {isSet ? <span className="text-teal-400">Set</span>
                                                : envVar.required ? <span className="text-rose-400">Missing (required)</span>
                                                    : <span className="text-slate-500">Not set</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-slate-500">
                    Set automatically by Vercel: <Mono>VERCEL</Mono>, <Mono>VERCEL_URL</Mono>, <Mono>VERCEL_GIT_COMMIT_SHA</Mono>. Storage modes per profile live in <Mono>config/config.json</Mono> (deploy: login <Mono>{runtimeConfig.deploy.loginMode}</Mono>, Mongo blog <Mono>{runtimeConfig.deploy.mongoBlogMode}</Mono>, PG blog <Mono>{runtimeConfig.deploy.postgresBlogMode}</Mono>).
                </p>
            </Section>

            <Section icon={Database} title="MongoDB schema">
                <Suspense fallback={<SchemaLoading />}>
                    <MongoSchemaView mock={!usesMongo} />
                </Suspense>
            </Section>

            <Section icon={Table2} title="Postgres schema">
                <Suspense fallback={<SchemaLoading />}>
                    <PostgresSchemaView mock={!usesPostgres} />
                </Suspense>
            </Section>
        </div>
    );
}
