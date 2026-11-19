import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from '../src/fuzzy.ts';

describe('fuzzyMatch', () => {
  it('requires every character in order', () => {
    expect(fuzzyMatch('rdm', 'docs/README.md')).not.toBeNull();
    expect(fuzzyMatch('mdr', 'docs/README.md')).toBeNull();
  });

  it('ranks file name matches above folder matches', () => {
    const results = fuzzyFilter('note', ['notes/archive/old.md', 'projects/note.md'], (s) => s);
    expect(results[0]!.item).toBe('projects/note.md');
  });

  it('ranks consecutive matches higher', () => {
    const results = fuzzyFilter('plan', ['p-l-a-n.md', 'plan.md'], (s) => s);
    expect(results[0]!.item).toBe('plan.md');
  });

  it('returns matched positions for highlighting', () => {
    expect(fuzzyMatch('ab', 'xab.md')!.positions).toEqual([1, 2]);
  });
});
