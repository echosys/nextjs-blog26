# Tracker

Daily journal with progress categories, a to-do system with priorities, and analytics. Route prefix: `/tracker` (tabs: Journal, To-dos, Analytics). Storage: local JSON file in the `local` profile, MongoDB in `deploy` (`trackerMode` in `config/config.json`).

## Journal (`/tracker`)

- One entry per calendar day (the browser's local date). Pick a day with the arrows or the date picker; future days are disabled.
- Each entry has free-text **notes** and a value per **active category**:
  - `boolean` categories (e.g. WFH, In Office) — toggle done / not done.
  - `amount` categories (e.g. Workout in min, Study in units) — enter a non-negative number; optional unit and goal.
- **Save day** writes the entry. Saving a day with no notes and no values removes it, so the day list only shows days with content.
- Values for **retired** categories on the selected day are shown greyed out, marked "retired", and are read-only. Saving the day keeps them unchanged.
- The right side lists every tracked day grouped by month (newest first). A day appears if it has an entry or a to-do completed on it. Active category values are shown as teal chips, retired ones as dashed grey chips, and completed to-dos as a count.
- Switching days with unsaved changes asks for confirmation.

### Default categories

Configured in `config/config.json` → `tracker.defaultCategories` and created the first time the tracker storage is used:

| Name | Type | Unit | Goal |
| --- | --- | --- | --- |
| Workout | amount | min | 30 |
| WFH (work from home) | boolean | — | — |
| In Office | boolean | — | — |
| Chores | amount | min | — |
| Study | amount | units | — |
| Tasks | amount | units | — |

Local demo data (`config/localTrackerData.json`, git-ignored) additionally contains a retired **Reading** category (min) that was replaced by **Study** three weeks ago, to show the retired-category behaviour. Delete the file to start fresh; defaults are re-seeded on next use.

## Category lifecycle (edit, rename, delete)

History is append-only: a category's stored values always keep their original meaning.

| Action | What happens |
| --- | --- |
| Add | New category, starts today. Its storage key is derived from the name and is never reused. |
| Edit goal only | Updated in place; history unchanged. |
| Rename, change type (boolean ↔ amount), or change unit | The old category is **retired** today and a **new** category starts today. Past values stay under the old category (which records `replacedBy`). Nothing is relabelled or converted. |
| Delete | The category is **retired** (not removed). All journal values are kept. |
| Restore | A retired category becomes active again (only if no active category has the same name). |
| Re-create a retired name | Gets a fresh key (e.g. `tasks-2`), so old and new history never merge. |

Rules:

- Only active categories can be logged or edited. Retired categories are read-only.
- Two active categories can't share a name (case-insensitive).
- In the category manager, editing shows an amber notice when the change will start a new category ("Save as new category"), and a neutral notice for goal-only edits ("Save goal").

## To-dos (`/tracker/todos`)

Four quadrants:

- **Now** (top left): quick ("regular") to-dos. Each stays here for `tracker.regularTodoWindowDays` (default 3) from creation, done or not. Shows at most `tracker.activeTodoLimit` (default 15) with a "+N more" toggle. Open items show time left; the pin button keeps one until done (moves it to Tier 2).
- **History** (bottom left): quick to-dos whose window passed, plus completed long-term to-dos, grouped by month. Status is **done** (with the day) or **expired** (backlog). Expired items can be revived (back to Now for another window) or pinned as long-term.
- **Tier 1 · must do** (top right): open long-term to-dos that should always be visible.
- **Tier 2 · important** (bottom right): open long-term to-dos that matter but are secondary. Items can be raised/lowered between tiers.

Completing a to-do records the local day (`doneDate`); it then appears on that day in the Journal.

## Analytics (`/tracker/analytics`)

- **Period**: buttons from `tracker.analyticsRangesDays` (default 7 / 30 / 90 days / 1 year).
- **Heatmap** (`tracker.heatmapWeeks`, default 53 weeks, Sunday-first like GitHub): for "All", intensity is the number of values + notes that day; for one category, done days (boolean) or value relative to the goal (amount). Hover shows the day's details.
- **Category cards** for the selected period: days logged / days in period, rate, current and longest streak; for amounts also total, average per logged day, best day, days meeting the goal, and a daily bar chart with a goal line. Boolean categories show a day strip.
- **Retired categories**:
  - Hidden by default; "All active categories" is the default filter.
  - Shown via the **Include retired** checkbox or by choosing one under **Retired** in the category dropdown.
  - Their cards are dashed and dimmed, state the retirement day and replacement, and have no current streak.
  - Days outside a category's lifetime (before its start/first value, after its retirement) are shaded as "not tracked" in the heatmap, strip, and bar chart, and are excluded from day counts, rates, and streaks.
- **To-dos** card: completed in the period, expired quick to-dos, open long-term.

## Acceptance criteria

- Renaming "Chores" to "Housework" leaves every past Chores value under "Chores" (retired) and starts "Housework" empty from today.
- Deleting a category never removes journal values; they remain visible in the Journal (greyed) and in Analytics when retired categories are included.
- Saving a day never changes values of retired categories, even if the request contains them.
- Analytics shows only active categories unless retired ones are explicitly included or selected.
- All "today" calculations use the browser's timezone.
