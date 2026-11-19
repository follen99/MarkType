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
    return decodeURI(src);
  } catch {
    return src;
  }
}
