import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_FOLDERS,
  addRecent,
  parseSession,
  pathList,
  planRestore,
  removeRecent,
  samePath,
} from '../src/session.ts';

describe('recent folders', () => {
  it('puts the latest first, without duplicates (case and slashes ignored)', () => {
    const list = addRecent(['C:/Notes', 'D:\\Work'], 'd:/work', MAX_RECENT_FOLDERS);
    expect(list).toEqual(['d:/work', 'C:/Notes']);
  });

  it('keeps at most 10 folders', () => {
    let list: string[] = [];
    for (let i = 0; i < 15; i++) list = addRecent(list, `C:\\f${i}`, MAX_RECENT_FOLDERS);
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('C:\\f14');
    expect(list.at(-1)).toBe('C:\\f5');
  });

  it('removes a folder whatever the spelling', () => {
    expect(removeRecent(['C:\\Notes', 'D:\\Work'], 'c:/notes')).toEqual(['D:\\Work']);
  });

  it('reads only strings from the prefs', () => {
    expect(pathList(['a', 3, null, '', 'b'], 10)).toEqual(['a', 'b']);
    expect(pathList('nope', 10)).toEqual([]);
  });

  it('compares paths like Windows', () => {
    expect(samePath('C:\\A\\b.md', 'c:/a/B.md')).toBe(true);
    expect(samePath('C:/a', 'C:/ab')).toBe(false);
  });
});

describe('session restore', () => {
  const disk: Record<string, 'file' | 'dir'> = {
    'C:/Notes': 'dir',
    'C:/Notes/a.md': 'file',
    'C:/Notes/b.md': 'file',
  };
  const exists = async (path: string) => disk[path] ?? null;

  it('parses the saved session and ignores junk', () => {
    expect(parseSession(null)).toEqual({ files: [], active: null });
    expect(parseSession({ files: ['a.md', 4], active: 'b.md' })).toEqual({ files: ['a.md'], active: null });
    expect(parseSession({ files: ['C:/a.md'], active: 'c:\\A.md' })).toEqual({
      files: ['C:/a.md'],
      active: 'c:\\A.md',
    });
  });

  it('reopens the folder and the files that still exist', async () => {
    const plan = await planRestore(
      'C:/Notes',
      { files: ['C:/Notes/a.md', 'C:/Notes/b.md'], active: 'C:/Notes/b.md' },
      exists,
    );
    expect(plan).toEqual({
      folder: 'C:/Notes',
      files: ['C:/Notes/a.md', 'C:/Notes/b.md'],
      active: 'C:/Notes/b.md',
      missing: [],
    });
  });

  it('skips deleted files and reports them', async () => {
    const plan = await planRestore(
      'C:/Notes',
      { files: ['C:/Notes/a.md', 'C:/Notes/gone.md'], active: 'C:/Notes/gone.md' },
      exists,
    );
    expect(plan.files).toEqual(['C:/Notes/a.md']);
    expect(plan.active).toBeNull();
    expect(plan.missing).toEqual(['C:/Notes/gone.md']);
  });

  it('starts without a folder when the last one is gone', async () => {
    const plan = await planRestore('C:/Old', { files: [], active: null }, exists);
    expect(plan.folder).toBeNull();
    expect(plan.missing).toEqual(['C:/Old']);
  });

  it('does not take a file for the folder', async () => {
    const plan = await planRestore('C:/Notes/a.md', { files: [], active: null }, exists);
    expect(plan.folder).toBeNull();
  });
});
