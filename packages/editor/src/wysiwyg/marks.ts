import type { Mark, MarkType, ResolvedPos } from 'prosemirror-model';

export interface MarkRun {
  mark: Mark;
  from: number;
  to: number;
}

/**
 * Finds the contiguous run of `type` around `$pos` inside its textblock (edges included, like Typora,
 * which expands an inline element as soon as the cursor touches it).
 */
export function markRunAt($pos: ResolvedPos, type: MarkType): MarkRun | null {
  const parent = $pos.parent;
  if (!parent.inlineContent) return null;
  const base = $pos.start();
  let run: MarkRun | null = null;
  let found: MarkRun | null = null;

  parent.forEach((child, offset) => {
    if (found) return;
    const mark = type.isInSet(child.marks);
    const from = base + offset;
    const to = from + child.nodeSize;
    if (mark && run && run.to === from && run.mark.eq(mark)) {
      run.to = to;
    } else {
      if (run && run.from <= $pos.pos && $pos.pos <= run.to) found = run;
      run = mark ? { mark, from, to } : null;
    }
  });
  if (!found && run && (run as MarkRun).from <= $pos.pos && $pos.pos <= (run as MarkRun).to) found = run;
  return found;
}
