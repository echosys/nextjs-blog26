// Tracks the order of post ids currently shown in a list view (per route) so the
// standalone edit page can offer Prev/Next navigation without re-fetching the whole list.
// Intentionally uses sessionStorage (not a server round-trip) since this is purely a
// client-side view-ordering convenience, not persisted/shared data.

type EditNavRoute = 'mongo' | 'pg';

const STORAGE_PREFIX = 'blogEditNav:';

export function setEditNavIds(route: EditNavRoute, ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + route, JSON.stringify(ids));
  } catch {
    // sessionStorage can throw in private-browsing/storage-full edge cases — nav is a nice-to-have, so ignore.
  }
}

export function getAdjacentIds(route: EditNavRoute, currentId: string): { prevId: string | null; nextId: string | null } {
  if (typeof window === 'undefined') return { prevId: null, nextId: null };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + route);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const idx = ids.indexOf(currentId);
    if (idx === -1) return { prevId: null, nextId: null };
    return {
      prevId: idx > 0 ? ids[idx - 1] : null,
      nextId: idx < ids.length - 1 ? ids[idx + 1] : null,
    };
  } catch {
    return { prevId: null, nextId: null };
  }
}
