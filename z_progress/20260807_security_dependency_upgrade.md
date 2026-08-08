# 2026-08-07 — Security dependency upgrade (npm audit)

## What changed

`npm audit` reported 15 vulnerabilities (1 low, 5 moderate, 8 high, 1 critical).
Resolved all of them; `npm audit` now reports **0 vulnerabilities**.

### package.json — direct dependency bumps
- `next`: `^14.2.35` → `^15.5.23` (fixes multiple high-severity Next.js
  advisories: RSC DoS, WebSocket SSRF, cache poisoning, XSS in CSP nonces,
  Image Optimizer DoS, etc. — all fixed by 15.5.16 or earlier; picked the
  latest patched 15.x release to avoid the breaking React 19 / Node 22
  requirements that come with the Next.js 16 major).
- `mongoose`: `^8.7.0` → `^8.24.2` (fixes prototype pollution in update
  casting, GHSA-664h-wqgq-64gw).
- `postcss`: `^8.5.8` → `^8.5.26` (fixes XSS in stringify output, arbitrary
  file read / path traversal via `sourceMappingURL`).
- `js-yaml`: `^4.1.0` → `^4.3.1` (fixes quadratic-complexity DoS via merge
  keys / `!!omap` resolution).

### package.json — new `overrides` to patch transitive/nested dependencies
that could not be bumped by their parent packages' own releases:
- `minimatch` → `^10.2.6`, `brace-expansion` → `^5.0.9` (ReDoS/DoS fixes;
  pulled in via `jest`'s dependency chain).
- `handlebars` → `^4.7.9` (critical JS injection / prototype pollution
  fixes; pulled in via `ts-jest`).
- `svgo` → `^3.3.4` (DoS + `removeScripts` XSS bypass; pulled in via
  `@svgr/webpack`).
- `yaml` → `^2.9.0` (stack overflow via deeply nested collections; pulled
  in via `next-mdx-remote`, `tailwindcss`, `yaml-loader`).
- `sharp` → `^0.35.3` (libvips CVEs; optional dependency of `next`'s image
  optimizer).
- `prismjs` → `^1.30.0` (DOM clobbering XSS; pulled in via `refractor` →
  `@mapbox/rehype-prism`, which has no upstream fix release itself).
- Scoped (parent-specific) overrides to avoid forcing an incompatible
  major version onto packages that expect an older API:
  - `next` → its bundled `postcss` → `^8.5.26`.
  - `gray-matter` and `@istanbuljs/load-nyc-config` → their nested
    `js-yaml` → `^3.15.1` (kept on the 3.x line since these packages use
    the old `js-yaml` v3 API; only the root `js-yaml` was bumped to v4).
  - `tinyglobby` → `picomatch` → `^4.0.5`; `micromatch`/`chokidar` →
    `picomatch` → `^2.3.2` (two picomatch majors are legitimately used in
    parallel by different consumers, so each was patched within its own
    major line instead of collapsing to one version).

Ran a clean reinstall (`rm -rf node_modules package-lock.json && npm
install`) because nested/scoped `overrides` were not being fully applied
against the existing lockfile until it was regenerated from scratch.

## Why

The user reported `npm audit` showing 15 vulnerabilities (including 1
critical, 8 high) on every `run.command` startup. Fixed all of them while
avoiding `npm audit fix --force`'s default suggestion of jumping straight
to `next@16.3.0`, since that is a second major version bump (14 → 16) that
also requires React 19 and a newer minimum Node version. Next.js 15.5.23
resolves every flagged advisory and still supports React 18, so it is a
much lower-risk upgrade path.

## Verification

- `npm audit` → `found 0 vulnerabilities`.
- `npm run build` → compiles successfully, all routes generated.
- `npm test` → all 5 existing tests pass.

## Assumptions

- The codebase already used the Next.js 15-style async APIs
  (`await cookies()`, `await headers()`, `searchParams: Promise<...>`) in
  `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/mongo/page.tsx`, and
  `src/app/pg/page.tsx` even while running on Next 14, so the framework
  upgrade to 15 required no source code changes.
- No manual dev server smoke test of every page was performed beyond
  `npm run build` and the existing Jest suite; assumed passing build +
  tests is sufficient given this is a dependency-only change with no
  application logic modified.
- The `@mapbox/rehype-prism` / `refractor` / `prismjs` override forces
  `prismjs` to `1.30.0` even though `refractor` declares `~1.27.0`;
  assumed compatible since Prism's core `highlight()` API and grammar
  format have not changed across these minor versions.

---

# Post list sorting, information density, and edit-flow improvements

## What changed

- **Sorting**: `listMongoBlogs` and `listPgBlogs` in
  [src/lib/storage.ts](../src/lib/storage.ts) now accept `sortField`
  (`createdAt` | `updatedAt`) and `sortOrder` (`asc` | `desc`), implemented
  for both the JSON-file and native (Mongo/Postgres) backends. Sorting by
  "Last Edited" falls back to `createdAt` for posts that were never
  updated. Added a shared `SortControl` client component
  ([src/components/SortControl.tsx](../src/components/SortControl.tsx))
  rendered on both `/mongo` and `/pg`, driven by a `sort` query param
  (e.g. `?sort=updated_desc`) so the choice is bookmarkable/shareable.
- **Information density**: redesigned the post tiles in `MongoPostList`
  and `PgPostList` — merged the date/tags into one compact meta row near
  the title (with a new "Edited {date}" badge when a post has been
  updated) instead of a separate bottom footer row with its own
  border/padding. Tile spacing tightened (`p-6`→`p-5`, `gap-6`→`gap-4`,
  removed the always-present `mb-6`/`pt-4`/border-top footer), so more
  posts fit on screen. The attachment link footer is now only rendered
  when an attachment actually exists, instead of an always-present bottom
  row taking space even without one.
- **Edit-then-preview flow**: after saving on `/mongo/edit/[id]` or
  `/pg/edit/[id]`, the redirect now includes `&previewId=<id>` (e.g.
  `/mongo?success=true&previewId=123`). `MongoPostList`/`PgPostList`
  detect this prop on mount, reopen `PostPreview` at that post, and then
  strip `previewId` from the URL via `router.replace` (using
  `window.location` directly rather than `useSearchParams`, since the
  latter requires a Suspense boundary) so refreshing or navigating back
  doesn't unexpectedly reopen the preview again. `PostPreview` itself now
  also shows an "Edited {date}" line when `updatedAt` is present.

## Why

User feedback: only one sort option existed (implicit creation-date
descending); post tiles wasted vertical space on a footer date row that
limited content previews to one visible line; and saving an edit dropped
the user back at the top of the list, forcing them to re-scroll and
re-find the post to keep refining it.

## Verification

- `npm run build` → compiles successfully, no type errors (had to null-
  guard `useSearchParams()` in `SortControl`, which can return `null`).
- `npm test` → all existing tests still pass (pagination logic untouched).
- Manually verified via the dev server: sort dropdown updates the `sort`
  query param, editing "Mongo Test Post" and saving reopens its preview
  automatically with `previewId` stripped from the resulting URL, and the
  "Edited" badge appears on both the tile and the preview modal.

## Assumptions

- No new config values were added to `config/config.json` — the default
  sort (`created_desc`, matching prior behavior) and tile density are UI
  preferences, not environment/runtime configuration, consistent with how
  pagination limits are already hardcoded inline rather than config-driven.
- Did not add server-side logging for list/sort reads — existing
  `storage.ts` only logs writes (create/update/delete) and auth, not
  list reads, so sorting (a read-only view preference) follows that same
  convention rather than introducing new per-render log noise.
- Only the edit flow (not the "New Post" creation flow) was changed to
  return to a reopened preview, since that's specifically what was
  requested; new-post creation still returns to the top of the list.

---

# Cross-post edit navigation, collapsible tag sidebar, and Outlook-style quick edit

## What changed

- **Shared edit form components**: extracted the full edit-page logic out
  of `/mongo/edit/[id]/page.tsx` and `/pg/edit/[id]/page.tsx` into two new
  reusable components, [src/components/MongoEditForm.tsx](../src/components/MongoEditForm.tsx)
  and [src/components/PgEditForm.tsx](../src/components/PgEditForm.tsx).
  Each supports a `variant` prop: `"page"` (identical behavior to the old
  standalone route — redirects to the list with `?success=true&previewId=`
  on save) or `"panel"` (new — stays open after saving, shows a "Saved"
  flash for ~2s via `onSaved`, and exposes `onClose` instead of
  redirecting). Both expose an imperative `EditFormHandle` (via
  `forwardRef`/`useImperativeHandle`) with `requestNavigate(targetId |
  null)`, so external UI (list rows, standalone Prev/Next) can trigger the
  same dirty-check gate the in-form buttons use.
- **Dirty tracking + discard confirmation**: [src/components/ContentEditor.tsx](../src/components/ContentEditor.tsx)
  gained an `onChange` callback (fired on input/blur, successful image
  paste, and inline-image removal). Both edit forms wire this plus the
  title/tags/file inputs to a `markDirty()` flag. Any navigation action
  (Prev/Next, panel close, switching rows in quick edit) checks
  `isDirty` first; if dirty, it defers the action and shows a new shared
  [src/components/DiscardChangesDialog.tsx](../src/components/DiscardChangesDialog.tsx)
  ("Discard changes?" / Keep Editing / Discard) before proceeding. A
  successful save clears the dirty flag.
- **Prev/Next on the standalone edit pages**: added
  [src/lib/editNav.ts](../src/lib/editNav.ts), a small `sessionStorage`
  helper (`setEditNavIds(route, ids)` / `getAdjacentIds(route, id)`) that
  `MongoPostList`/`PgPostList` populate with the current list's id order
  on every render. The standalone `/mongo/edit/[id]` and `/pg/edit/[id]`
  pages are now thin client wrappers that read `{prevId, nextId}` from
  this helper and render `<MongoEditForm variant="page" .../>` /
  `<PgEditForm variant="page" .../>`, remounting (`key={id}`) on
  navigation so uncontrolled inputs and the content editor reset cleanly.
- **Collapsible "Filter by Tags" sidebar**: the tags aside, heading,
  `SortControl`, and "New Post" link were moved from the server
  components (`mongo/page.tsx`, `pg/page.tsx`) into the client list
  components (`MongoPostList`, `PgPostList`), which now also own a
  `tagsCollapsed` boolean toggled by a chevron button in the aside
  header — collapsing it shrinks the aside to a slim icon-only strip so
  the post list can use the freed-up width.
- **Outlook-style quick edit**: clicking the pencil ("Quick edit") icon on
  a post tile no longer navigates to the full edit route — it now opens
  an inline split view in place of the tile grid: a compact scrollable
  list of post titles/dates on the left, and the corresponding
  `MongoEditForm`/`PgEditForm` (`variant="panel"`) on the right. Clicking
  another row in the compact list calls `formRef.current.requestNavigate(id)`
  (routing through the same dirty-check/discard-dialog gate); the panel's
  own Prev/Next buttons do the same. Entering quick edit auto-collapses
  the tags sidebar (remembering whatever the prior collapsed state was in
  a ref, so closing quick edit restores it exactly). The panel header
  includes a "Maximize2" link to open the same post in the full
  standalone editor, and an X button to exit back to the normal tile
  grid (also gated by the dirty check). The full-page edit route
  (`/mongo/edit/[id]` / `/pg/edit/[id]`) is unchanged and still reachable
  directly or via that link.

## Why

User wanted: (1) the existing preview Prev/Next behavior mirrored on the
edit pages, with a safety net so in-progress edits aren't silently lost
when navigating away; (2) more usable space when not actively filtering
by tag; (3) a faster, Outlook-mail-style inline editing experience that
avoids a full page navigation for quick tweaks, while keeping the
existing full-page editor available as a fallback/deep-link target.

## Verification

- `npm run build` → compiles successfully, no type errors, all routes
  generated.
- `npx jest` → all 5 existing tests pass.
- Manually verified via the dev server (logged in as `test`/`testpw`):
  - `/mongo` and `/pg`: "Filter by Tags" collapse/expand toggle works and
    persists the freed-up width to the post list.
  - Clicking the pencil icon opens the quick-edit split view with the
    tags sidebar auto-collapsed; typing in the Title field and then
    clicking the X close button shows the "Discard changes?" dialog;
    clicking "Discard" closes the panel, restores the sidebar, and
    reverts the unsaved title change.
  - Clicking "Save Changes" in the panel (PG route) shows a "Saved" flash
    next to the header while keeping the panel open, and the tile's
    "Edited" date updates after closing.
  - `/mongo/edit/1` (standalone route) renders "Edit Post" with
    Prev/Next chevrons (disabled here, since only one post exists in the
    seed data) and no panel-only controls (no Maximize2/X/Saved-flash),
    confirming the `variant="page"` vs `"panel"` split renders correctly.

## Assumptions

- The unsaved-changes discard guard only applies to the explicit
  navigation actions added/changed in this pass — Prev/Next, quick-edit
  row switching, and closing the quick-edit panel. It is intentionally
  **not** applied to unrelated navigation such as changing the tag filter,
  changing the sort order, or the "Back to Blog" link on the standalone
  page, since none of those were part of the request and guarding them
  would require a broader in-app-navigation interception (e.g. a Next.js
  route-change listener) that wasn't asked for.
- Quick edit is only wired to the tile's pencil icon. `PostPreview`'s own
  "Edit Post" button (inside the preview modal) still opens the full
  standalone editor rather than quick edit, since the preview modal and
  quick-edit panel are visually two different full-screen-ish
  experiences and combining them wasn't requested.
- The "New Post" creation flow is untouched — quick edit and the
  discard-guard only apply to editing existing posts.
- `tagsCollapsed` state (and which state to restore to after quick edit)
  is plain in-memory component state, not persisted to
  `localStorage`/`sessionStorage` across page reloads — treated as a
  transient view preference rather than durable UI state, consistent
  with how sort order is already only persisted via the `?sort=` URL
  query param rather than storage.

---

# Quick-edit layout redesign + floating Save button

## What changed

- **Quick-edit panel layout**: in [src/components/MongoEditForm.tsx](../src/components/MongoEditForm.tsx)
  and [src/components/PgEditForm.tsx](../src/components/PgEditForm.tsx), the
  `variant="panel"` layout was changed from a two-column sidebar+content
  grid (three stacked full-height fields: Title, Tags, Attachment) to a
  single compact card above the content: Title/Tags/Attachment now sit
  side-by-side in one row (`grid sm:grid-cols-[1.2fr_1fr_1fr]`), with
  Inline Images (when present) and any submit error below that row. The
  content editor section is now a full-width block below the card
  (`flex-1 min-h-[55vh]`) instead of being squeezed into a narrow right
  column next to a tall sidebar. The `variant="page"` (standalone
  full-page editor) layout is unchanged — it still uses the sidebar +
  content grid, since it isn't sharing horizontal space with a compact
  post list the way the quick-edit panel is.
- **Header Save button**: added a compact "Save" button to the panel's
  header row (next to the Prev/Next/Maximize/Close icons), wired to the
  form via a shared `id`/`form` attribute pairing (`formId =
  "mongo-edit-form-<id>"` / `"pg-edit-form-<idStr>"`) rather than needing
  to be a descendant of the `<form>` element.
- **Floating Save button**: both variants now also render a
  `position: fixed` circular Save button pinned to the bottom-right of
  the viewport (`fixed bottom-6 right-6 z-40`), submitting the same form
  via the `form` attribute. It shows a spinner while submitting and a
  "Saved" pill next to it when the panel-variant save completes. Because
  it's viewport-fixed rather than positioned relative to any scrolling
  container, it stays reachable no matter how far down the user has
  scrolled into a long post's content — no more scrolling back to the
  top (or to a sidebar that no longer exists in the panel layout) just to
  hit Save.

## Why

Two related pieces of feedback: (1) the quick-edit split view (added in
the previous change) felt cramped because Title/Tags/Attachment were
each given their own full-width stacked row in a narrow column, when
they could sit compactly in one row and hand the freed-up space to the
content editor; (2) after that redesign removed the previously-sticky
sidebar in the panel, saving a long post required scrolling all the way
back up to reach the Save button. The user asked whether a floating
icon to jump back to the top, or a bottom-of-content Save button, would
help — a viewport-fixed floating Save button was chosen over both since
it lets the user save from any scroll position without needing to
navigate anywhere first, and it also helps the standalone full-page
editor on narrow/mobile viewports where the sidebar isn't sticky either.

## Verification

- `npm run build` → compiles successfully, no type errors.
- `npx jest` → all 5 existing tests pass.
- Manually verified via the dev server: opened quick edit, confirmed the
  new compact Title/Tags/Attachment row layout; pasted ~80 paragraphs of
  text into the content editor, scrolled to the very bottom of the page,
  confirmed the floating round Save button remained fixed in the
  bottom-right corner, and clicking it fired a `PUT /api/blogs` request
  (200 response) and showed both the header and floating "Saved"
  indicators — all without scrolling back up.

## Assumptions

- The floating Save button is shown for both `variant="page"` and
  `variant="panel"`, even though the standalone page's sidebar is
  already `lg:sticky` on desktop (so the floating button is somewhat
  redundant there above the `lg` breakpoint) — added uniformly since the
  sidebar isn't sticky on narrower/mobile layouts and the extra always-
  reachable Save affordance doesn't hurt on desktop.
- Did not add a separate "scroll to top" affordance; the floating button
  saves directly instead, which fully removes the need to scroll rather
  than just making the scroll-back trip faster.
