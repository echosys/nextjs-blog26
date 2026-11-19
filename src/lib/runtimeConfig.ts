import runtimeConfigJson from '../../config/config.json';

export type RuntimeProfile = 'local' | 'deploy';
export type LoginMode = 'json' | 'mongo';
export type MongoBlogMode = 'json' | 'mongo';
export type PostgresBlogMode = 'json' | 'postgres';
export type TrackerMode = 'json' | 'mongo';
export type OpsMode = 'json' | 'mongo';

export type TrackerCategorySeed = {
  readonly key: string;
  readonly name: string;
  readonly type: 'boolean' | 'amount';
  readonly unit?: string;
  readonly goal?: number;
};

type RuntimeConfig = {
  readonly runtimeNotes: string;
  readonly inlineImageTargetKB: number;
  readonly inlineImageMaxDimensionPx: number;
  /** Client-side cap for single-request saves (Vercel rejects bodies over 4.5 MB). */
  readonly maxSingleRequestBytes: number;
  readonly inlineThumbnailMaxPx: number;
  readonly inlineThumbnailMaxResizePx: number;
  readonly keepAlive?: {
    readonly enabled?: boolean;
  };
  readonly auth: {
    /** Login session lifetime; browsers cap cookies at 400 days. */
    readonly sessionMaxAgeDays: number;
  };
  readonly local: {
    readonly loginMode: LoginMode;
    readonly mongoBlogMode: MongoBlogMode;
    readonly postgresBlogMode: PostgresBlogMode;
    readonly trackerMode: TrackerMode;
    readonly opsMode: OpsMode;
  };
  readonly deploy: {
    readonly target: string;
    readonly loginMode: LoginMode;
    readonly mongoBlogMode: MongoBlogMode;
    readonly postgresBlogMode: PostgresBlogMode;
    readonly trackerMode: TrackerMode;
    readonly opsMode: OpsMode;
  };
  readonly mongo: {
    readonly databaseName: string;
    readonly loginCollection: string;
    readonly blogCollection: string;
  };
  readonly postgres: {
    readonly blogTable: string;
    readonly attachmentTable: string;
  };
  readonly ops: {
    readonly keepAliveRunsCollection: string;
    readonly loginAttemptsCollection: string;
    /** Records older than this are removed (Mongo TTL index / JSON trim). */
    readonly retentionDays: number;
    readonly recentListLimit: number;
  };
  readonly tracker: {
    readonly entriesCollection: string;
    readonly categoriesCollection: string;
    readonly todosCollection: string;
    readonly regularTodoWindowDays: number;
    readonly activeTodoLimit: number;
    readonly analyticsRangesDays: readonly number[];
    readonly heatmapWeeks: number;
    readonly defaultCategories: readonly TrackerCategorySeed[];
  };
  readonly json: {
    readonly loginFile: string;
    readonly mongoBlogFile: string;
    readonly postgresBlogFile: string;
    readonly trackerFile: string;
    readonly opsFile: string;
    readonly mockSchemaFile: string;
  };
};

const runtimeConfig = runtimeConfigJson as RuntimeConfig;

function isLocalHost(host?: string | null): boolean {
  if (!host) {
    const isHostedVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
    return !isHostedVercel;
  }

  const normalizedHost = host.toLowerCase();
  return normalizedHost.includes('localhost') || normalizedHost.includes('127.0.0.1');
}

export function resolveRuntimeProfile(host?: string | null): RuntimeProfile {
  return isLocalHost(host) ? 'local' : 'deploy';
}

export function getRuntimeStorageConfig(host?: string | null) {
  const runtime = resolveRuntimeProfile(host);

  return {
    runtime,
    loginMode: runtime === 'local' ? runtimeConfig.local.loginMode : runtimeConfig.deploy.loginMode,
    mongoBlogMode: runtime === 'local' ? runtimeConfig.local.mongoBlogMode : runtimeConfig.deploy.mongoBlogMode,
    postgresBlogMode: runtime === 'local' ? runtimeConfig.local.postgresBlogMode : runtimeConfig.deploy.postgresBlogMode,
    trackerMode: runtime === 'local' ? runtimeConfig.local.trackerMode : runtimeConfig.deploy.trackerMode,
    opsMode: runtime === 'local' ? runtimeConfig.local.opsMode : runtimeConfig.deploy.opsMode,
    mongo: runtimeConfig.mongo,
    postgres: runtimeConfig.postgres,
    json: runtimeConfig.json,
    deployTarget: runtimeConfig.deploy.target,
    runtimeNotes: runtimeConfig.runtimeNotes,
  };
}

export function isKeepAliveEnabled(): boolean {
  return runtimeConfig.keepAlive?.enabled !== false;
}

export default runtimeConfig;