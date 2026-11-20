/** Recent lists and the saved session (open tabs), as pure functions over plain data. */

export const MAX_RECENT_FOLDERS = 10;

/** Paths compared the way Windows does: case-insensitive, either slash. */
export const samePath = (a: string, b: string) =>
  a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

/** `path` first, without duplicates, at most `max` entries. */
export function addRecent(list: readonly string[], path: string, max: number): string[] {
  return [path, ...list.filter((p) => !samePath(p, path))].slice(0, max);
}

export function removeRecent(list: readonly string[], path: string): string[] {
  return list.filter((p) => !samePath(p, path));
}

/** A list of paths read from the prefs (anything else is dropped). */
export function pathList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item !== '').slice(0, max);
}

/** The open tabs with a file, in order, and the active one (prefs key `session`). */
export interface Session {
  files: string[];
  active: string | null;
}

export function parseSession(value: unknown): Session {
  if (!value || typeof value !== 'object') return { files: [], active: null };
  const raw = value as { files?: unknown; active?: unknown };
  const files = pathList(raw.files, 100);
  const active =
    typeof raw.active === 'string' && files.some((p) => samePath(p, raw.active as string))
      ? raw.active
      : null;
  return { files, active };
}

export interface RestorePlan {
  folder: string | null;
  files: string[];
  active: string | null;
  /** Saved folder and files that no longer exist. */
  missing: string[];
}

/**
 * What to reopen at startup: the last folder and the session files that still exist. Deleted ones end up
 * in `missing` (to drop them from the prefs and tell the user once).
 */
export async function planRestore(
  folder: string | null,
  session: Session,
  exists: (path: string) => Promise<'file' | 'dir' | null>,
): Promise<RestorePlan> {
  const missing: string[] = [];
  let keptFolder: string | null = null;
  if (folder) {
    if ((await exists(folder)) === 'dir') keptFolder = folder;
    else missing.push(folder);
  }
  const kinds = await Promise.all(session.files.map((path) => exists(path)));
  const files: string[] = [];
  session.files.forEach((path, index) => {
    if (kinds[index] === 'file') files.push(path);
    else missing.push(path);
  });
  const active = session.active && files.some((p) => samePath(p, session.active!)) ? session.active : null;
  return { folder: keptFolder, files, active, missing };
}
