/** True for `https:`, `data:`, `mailto:`, `//host`… but not for Windows paths like `C:\`. */
export function hasScheme(src: string): boolean {
  return src.startsWith('//') || (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^[a-z]:[\\/]/i.test(src));
}
