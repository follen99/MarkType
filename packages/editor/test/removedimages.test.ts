import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { history, undo } from 'prosemirror-history';
import { parseMarkdown } from '../src/markdown/parse.ts';
import { KEEP_IMAGES_META, removedImageSources } from '../src/wysiwyg/removedimages.ts';

const state = (markdown: string) =>
  EditorState.create({ doc: parseMarkdown(markdown), plugins: [history()] });

/** Position of the image with `src` in the document. */
function imagePos(s: EditorState, src: string): number {
  let found = -1;
  s.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === src) found = pos;
  });
  if (found < 0) throw new Error(`no image ${src}`);
  return found;
}

describe('removed image detection', () => {
  const md = 'Text ![a](assets/a.png) and ![b](assets/b.png)\n\nOther ![c](c.png)\n';

  it('reports an image deleted with Backspace/Delete', () => {
    const s = state(md);
    const pos = imagePos(s, 'assets/a.png');
    expect(removedImageSources(s.tr.delete(pos, pos + 1))).toEqual(['assets/a.png']);
  });

  it('reports every image of a deleted range', () => {
    const s = state(md);
    const tr = s.tr.delete(1, s.doc.content.size - 1);
    expect(removedImageSources(tr).sort()).toEqual(['assets/a.png', 'assets/b.png', 'c.png']);
  });

  it('reports images replaced by typed text', () => {
    const s = state(md);
    const pos = imagePos(s, 'c.png');
    const tr = s.tr.setSelection(TextSelection.create(s.doc, pos, pos + 1)).insertText('x');
    expect(removedImageSources(tr)).toEqual(['c.png']);
  });

  it('ignores edits that keep the image', () => {
    const s = state(md);
    expect(removedImageSources(s.tr.insertText('hello', 1))).toEqual([]);
    const pos = imagePos(s, 'assets/b.png');
    const node = s.doc.nodeAt(pos)!;
    // Editing the alt text replaces the node with an equal source.
    expect(removedImageSources(s.tr.setNodeMarkup(pos, null, { ...node.attrs, alt: 'new' }))).toEqual([]);
  });

  it('ignores cut, drop, undo/redo and app rewrites', () => {
    const s = state(md);
    const pos = imagePos(s, 'assets/a.png');
    const del = () => s.tr.delete(pos, pos + 1);
    expect(removedImageSources(del().setMeta('uiEvent', 'cut'))).toEqual([]);
    expect(removedImageSources(del().setMeta('uiEvent', 'drop'))).toEqual([]);
    expect(removedImageSources(del().setMeta(KEEP_IMAGES_META, true))).toEqual([]);

    // Undo of an inserted image removes it: not reported.
    const added = s.apply(s.tr.insert(1, s.schema.nodes.image!.create({ src: 'new.png' })));
    let undoTr: Transaction | null = null;
    undo(added, (tr) => (undoTr = tr));
    expect(undoTr).not.toBeNull();
    expect(removedImageSources(undoTr!)).toEqual([]);
  });

  it('does not report an image moved within the same transaction', () => {
    const s = state(md);
    const pos = imagePos(s, 'c.png');
    const node = s.doc.nodeAt(pos)!;
    const tr = s.tr.delete(pos, pos + 1).insert(1, node);
    expect(removedImageSources(tr)).toEqual([]);
  });
});
