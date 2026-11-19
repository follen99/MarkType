/** Editing commands shared by every mode. The app binds them to shortcuts and menu items. */
export const EDITOR_COMMANDS = [
  'undo',
  'redo',
  'selectAll',
  'bold',
  'italic',
  'underline',
  'inlineCode',
  'strike',
  'highlight',
  'clearFormat',
  'link',
  'image',
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'headingUp',
  'headingDown',
  'quote',
  'bulletList',
  'orderedList',
  'taskList',
  'codeBlock',
  'mathBlock',
  'horizontalRule',
  'table',
  'indent',
  'outdent',
  'exitBlock',
  'selectWord',
  'selectLine',
  'selectScope',
  'deleteWord',
] as const;

export type EditorCommandId = (typeof EDITOR_COMMANDS)[number];

export function isEditorCommand(id: string): id is EditorCommandId {
  return (EDITOR_COMMANDS as readonly string[]).includes(id);
}
