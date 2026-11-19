import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '../schema.ts';
import { htmlHasText, htmlToMarkdown } from '../markdown/html.ts';
import { parseMarkdown } from '../markdown/parse.ts';
import type { MarkdownStyle } from '../markdown/processor.ts';

/** An image ready to be referenced from markdown. */
export interface ImageRef {
  src: string;
  alt: string;
}

/** Stores a pasted or dropped image (next to the document) and returns how to reference it. */
export type SaveImage = (file: File) => Promise<ImageRef | null>;

export function imageFiles(data: DataTransfer | null): File[] {
  return data ? Array.from(data.files).filter((file) => file.type.startsWith('image/')) : [];
}

/** Inserts images at `pos` (a document position) or, without it, at the selection. */
export function insertImageNodes(view: EditorView, images: ImageRef[], pos?: number): void {
  if (!images.length || !view.editable) return;
  const nodes: PMNode[] = [];
  images.forEach((image, index) => {
    if (index) nodes.push(schema.text(' '));
    nodes.push(schema.nodes.image.create({ src: image.src, alt: image.alt, title: null }));
  });
  let tr = view.state.tr;
  if (pos !== undefined) {
    const clamped = Math.max(0, Math.min(pos, tr.doc.content.size));
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(clamped)));
  }
  tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export async function saveImages(saveImage: SaveImage, files: File[]): Promise<ImageRef[]> {
  const refs: ImageRef[] = [];
  for (const file of files) {
    const ref = await saveImage(file);
    if (ref) refs.push(ref);
  }
  return refs;
}

async function pasteHtml(view: EditorView, html: string, style: MarkdownStyle): Promise<void> {
  const markdown = await htmlToMarkdown(html, style);
  const doc = parseMarkdown(markdown);
  view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView());
}

export interface ClipboardOptions {
  style: MarkdownStyle;
  saveImage?: SaveImage;
}

/**
 * Paste and drop: image files are stored through `saveImage` and inserted as `![](src)`; HTML from
 * other programs becomes markdown. Copies from MarkType itself (`data-pm-slice`) and pastes inside code
 * keep ProseMirror's own handling.
 */
export function clipboardPlugin(options: ClipboardOptions): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data || view.state.selection.$from.parent.type.spec.code) return false;
        const html = data.getData('text/html');
        const plain = data.getData('text/plain');
        const files = options.saveImage ? imageFiles(data) : [];
        const useHtml = html && !html.includes('data-pm-slice') && (htmlHasText(html) || !files.length);
        if (useHtml) {
          event.preventDefault();
          pasteHtml(view, html, options.style).catch((error: unknown) => {
            console.error('HTML paste failed', error);
            view.dispatch(view.state.tr.insertText(plain));
          });
          return true;
        }
        if (files.length && options.saveImage) {
          event.preventDefault();
          void saveImages(options.saveImage, files).then((refs) => insertImageNodes(view, refs));
          return true;
        }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !options.saveImage) return false;
        const files = imageFiles(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void saveImages(options.saveImage, files).then((refs) => insertImageNodes(view, refs, at));
        return true;
      },
    },
  });
}
