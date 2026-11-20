import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';

/** Meta set on transactions that rewrite image sources without the user removing anything. */
export const KEEP_IMAGES_META = 'marktype-keep-images';

function countImages(doc: PMNode, from: number, to: number, counts: Map<string, number>, delta: number) {
  if (from >= to) return;
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'image') return true;
    // A leaf of size 1: inside the range only if it starts in it.
    if (pos >= from && pos < to) {
      const src = node.attrs.src as string;
      counts.set(src, (counts.get(src) ?? 0) + delta);
    }
    return false;
  });
}

/**
 * The `src` of the image nodes the user deleted in `tr` (typing over them, Backspace, Delete…). Images
 * that the same transaction puts back (an edited image, a moved block) do not count. Cut, drag and drop,
 * undo/redo and app rewrites are ignored: the image is still somewhere (clipboard, new place, history).
 */
export function removedImageSources(tr: Transaction): string[] {
  if (!tr.docChanged) return [];
  const ui = tr.getMeta('uiEvent') as string | undefined;
  if (ui === 'cut' || ui === 'drop') return [];
  if (tr.getMeta('history$') || tr.getMeta(KEEP_IMAGES_META)) return [];
  const counts = new Map<string, number>();
  tr.steps.forEach((step, index) => {
    const before = tr.docs[index]!;
    const after = tr.docs[index + 1] ?? tr.doc;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      countImages(before, oldStart, oldEnd, counts, 1);
      countImages(after, newStart, newEnd, counts, -1);
    });
  });
  return [...counts].filter(([, count]) => count > 0).map(([src]) => src);
}
