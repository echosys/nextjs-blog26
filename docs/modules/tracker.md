# Tracker

## Purpose

Personal daily tracker: a journal entry per day with notes and category metrics, a to-do system (quick vs long-term with priority tiers), and analytics (heatmap, per-category stats and charts).

## Responsibilities

- Persist categories, daily entries, and to-dos in JSON (local) or MongoDB (deploy).
- Enforce the append-only category lifecycle (retire/replace instead of delete/relabel).
- Bucket to-dos into Now / History / Tier 1 / Tier 2.
- Compute analytics client-side in the browser's timezone.

## Owned Paths

- `src/app/tracker/**` — pages (`page.tsx`, `todos/page.tsx`, `analytics/page.tsx`), layout with sub-tabs, client views, `client.tsx` helpers (`useMounted`, `trackerRequest`).
- `src/lib/tracker/**` — `model.ts` (client-safe types and pure logic), `storage.ts` (server adapter), `api.ts` (API helpers).
- `src/pages/api/tracker/**` — REST endpoints.

## Public Entry Points

- Pages: `/tracker`, `/tracker/todos`, `/tracker/analytics` (login required).
- `GET /api/tracker/categories` — all categories (active and retired).
- `POST /api/tracker/categories` `{ name, type, unit?, goal?, today? }` — create (starts `today`).
- `PATCH /api/tracker/categories?key=` `{ name, type, unit?, goal?, today? }` — goal-only edits in place; rename/type/unit change retires and replaces. `{ restore: true }` — restore a retired category.
- `DELETE /api/tracker/categories?key=&today=` — retire.
- `GET /api/tracker/entries`; `PUT /api/tracker/entries` `{ date, notes, metrics }` — upsert a day (empty → removed).
- `GET /api/tracker/todos`; `POST` `{ title, kind, tier }`; `PATCH ?id=` `{ done, doneDate, tier, kind, revive }`; `DELETE ?id=`.
- `today` is the browser's local `YYYY-MM-DD`; the server falls back to its own date.

## Key Files

- `src/lib/tracker/model.ts` — `TrackerCategory/Entry/Todo` types; date helpers; `bucketTodos`; `buildHeatmap`; `categoryWindow`, `isOutsideWindow`, `categoryStats`; `uniqueKey`, `categoryEditMode`; input sanitizers.
- `src/lib/tracker/storage.ts` — `listCategories`, `createCategory`, `updateCategory`, `retireCategory`, `restoreCategory`, `listEntries`, `saveEntry`, `listTodos`, `createTodo`, `updateTodo`, `deleteTodo`, `trackerSettings`.
- `src/app/tracker/JournalView.tsx` — day editor, day list, `CategoryManager`.
- `src/app/tracker/TodosView.tsx` — four-quadrant to-do board.
- `src/app/tracker/AnalyticsView.tsx` — heatmap, stats, bar chart, day strip.

## Dependencies

- `storage` module: `runtimeConfig` (`trackerMode`, `tracker.*` settings), `readJsonDocument`/`writeJsonDocument`, `getMongoClientPromise`, `logInfo`.
- `auth` module: `/tracker` and `/api/tracker/*` are protected by `src/proxy.ts`.

## Data Models

See `docs/database.md` → Tracker. Summary:

- Category `{ key, name, type: boolean|amount, unit?, goal?, startedOn?, retiredOn?, replacedBy?, createdAt }`
- Entry `{ date: YYYY-MM-DD (unique), notes, metrics: { [categoryKey]: true | number }, createdAt, updatedAt? }`
- To-do `{ title, kind: regular|longterm, tier: 1|2, createdAt, dueAt?, doneAt?, doneDate? }`

## Invariants

- Category keys are unique and never reused (`uniqueKey`); entry metrics reference keys, so history can't be relabelled.
- Categories are never deleted. Delete = retire; rename/retype/unit change = retire + new category with `replacedBy`.
- Only active categories accept new values. `saveEntry` replaces only active keys and preserves retired keys' values.
- At most one active category per name (case-insensitive).
- An entry with no notes and no metrics does not exist (saving it removes the entry).
- Regular to-dos are on "Now" until `dueAt` (creation + `regularTodoWindowDays`); long-term to-dos have no `dueAt`.
- Analytics excludes days outside a category's lifetime from counts, rates, and streaks; retired categories have no current streak.
- Date-dependent views render only after mount (browser timezone).

## Known Constraints

- Single user: no per-user ownership field.
- JSON mode read-modify-writes the whole file; concurrent writes can lose data (local development only).
- Analytics computes from all entries in the browser; fine for years of daily entries, not for very large datasets.
- `listTodos` (Mongo) is capped at 5000 most recent to-dos.

## Related Tests

- `src/__tests__/tracker.test.ts` — dates, stats and streaks, heatmap layout, to-do bucketing, input validation, category lifecycle (unique keys, edit mode, lifetime windows, window-aware stats).
