import runtimeConfigJson from '../../config/config.json';

export type RuntimeProfile = 'local' | 'deploy';
export type LoginMode = 'json' | 'mongo';
export type MongoBlogMode = 'json' | 'mongo';
export type PostgresBlogMode = 'json' | 'postgres';

type RuntimeConfig = {
  readonly runtimeNotes: string;
  readonly local: {
    readonly loginMode: LoginMode;
    readonly mongoBlogMode: MongoBlogMode;
    readonly postgresBlogMode: PostgresBlogMode;
  };
  readonly deploy: {
    readonly target: string;
    readonly loginMode: LoginMode;
    readonly mongoBlogMode: MongoBlogMode;
    readonly postgresBlogMode: PostgresBlogMode;
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
  readonly json: {
    readonly loginFile: string;
    readonly mongoBlogFile: string;
    readonly postgresBlogFile: string;
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
    mongo: runtimeConfig.mongo,
    postgres: runtimeConfig.postgres,
    json: runtimeConfig.json,
    deployTarget: runtimeConfig.deploy.target,
    runtimeNotes: runtimeConfig.runtimeNotes,
  };
}

export default runtimeConfig;