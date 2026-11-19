# Build

## Requirements

- Node.js 24 (see `.nvmrc`), npm 11.
- Dependencies are pinned by `package-lock.json`; install with `npm ci` (CI/Vercel) or `npm install`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | `next build` (Next.js 16, Turbopack). Type-checks with TypeScript (strict). |
| `npm start` | Serve the production build (`next start`). |
| `npm test` | `vitest run` — unit tests in `src/__tests__/`. |
| `npx tsc --noEmit -p .` | Type-check only. |
| `npm audit` | Dependency vulnerability check. |

## Stack

- Next.js 16 (App Router pages in `src/app`, API routes in `src/pages/api`, `src/proxy.ts` for auth).
- React 19, TypeScript 5 (strict), Tailwind CSS 3, lucide-react icons, DOMPurify.
- MongoDB driver 7, `pg` 8.
- Vitest for tests.

## Build-time values

- `next.config.js` injects `NEXT_PUBLIC_BUILD_TIME` and `NEXT_PUBLIC_GIT_COMMIT` (from `VERCEL_GIT_COMMIT_SHA` or `git rev-parse`), and defines redirects (`/blog` → `/blog/mongo`; legacy `/mongo/*`, `/pg/*` → `/blog/...`).
- `vercel.json` defines the daily keep-alive cron (`/api/keepalive`).

## Notes

- Watch the build output for Turbopack "whole project traced" warnings: dynamic `path.join(process.cwd(), …)` must stay scoped to a fixed subfolder (see `getAbsoluteConfigPath` in `src/lib/storage.ts`).
- `next dev` may generate `AGENTS.md` (Next.js agent rules); set `agentRules: false` in `next.config.js` to disable.
