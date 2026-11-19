/** Minimal path helpers for desktop paths (Windows `C:\…`, UNC and POSIX). */

export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\');
}

export function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index <= 0 ? path.slice(0, index + 1) : path.slice(0, index);
}

export function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** Joins a document directory and a relative markdown path, resolving `.` and `..`. */
export function resolvePath(baseDir: string, relative: string): string {
  const separator = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
  const parts = baseDir.split(/[\\/]/);
  for (const segment of relative.split(/[\\/]/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 1) parts.pop();
    } else parts.push(segment);
  }
  return parts.join(separator);
}

/** Decodes `%20`-style escapes in markdown image paths; leaves malformed input untouched. */
export function decodePathComponent(src: string): string {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

/** True if `path` is `folder` or inside it. */
export function isInside(path: string, folder: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const a = norm(path);
  const b = norm(folder);
  return a === b || a.startsWith(`${b}/`);
}

/** `child` relative to `folder`, with `/` separators (for display). */
export function relativePath(child: string, folder: string): string {
  const a = child.replace(/\\/g, '/');
  const b = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  return a.toLowerCase().startsWith(`${b.toLowerCase()}/`) ? a.slice(b.length + 1) : a;
}

/** Relative markdown path from the document at `fromFile` to `toFile` (for links between notes). */
export function relativeLink(fromFile: string, toFile: string): string {
  const from = dirname(fromFile).replace(/\\/g, '/').split('/');
  const to = toFile.replace(/\\/g, '/').split('/');
  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    from[common]!.toLowerCase() === to[common]!.toLowerCase()
  )
    common++;
  return [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
}
