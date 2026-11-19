import type { EditorCommandId } from '@marktype/editor';
import type { MessageKey } from '@marktype/i18n';
import { normalizeShortcut } from './keys.ts';

export const APP_COMMANDS = [
  'newFile',
  'openFile',
  'save',
  'saveAs',
  'closeWindow',
  'toggleSource',
  'toggleSplit',
  'zoomIn',
  'zoomOut',
  'zoomReset',
  'fullscreen',
  'about',
] as const;

export type AppCommandId = (typeof APP_COMMANDS)[number];
export type CommandId = AppCommandId | EditorCommandId;

/** Default shortcuts, matching Typora (docs/SHORTCUTS.md). */
export const DEFAULT_KEYBINDINGS: Partial<Record<CommandId, string[]>> = {
  newFile: ['Mod+N'],
  openFile: ['Mod+O'],
  save: ['Mod+S'],
  saveAs: ['Mod+Shift+S'],
  closeWindow: ['Mod+W'],
  undo: ['Mod+Z'],
  redo: ['Mod+Y', 'Mod+Shift+Z'],
  selectAll: ['Mod+A'],
  selectWord: ['Mod+D'],
  selectLine: ['Mod+L'],
  selectScope: ['Mod+E'],
  deleteWord: ['Mod+Shift+D'],
  heading1: ['Mod+1'],
  heading2: ['Mod+2'],
  heading3: ['Mod+3'],
  heading4: ['Mod+4'],
  heading5: ['Mod+5'],
  heading6: ['Mod+6'],
  paragraph: ['Mod+0'],
  headingUp: ['Mod+='],
  headingDown: ['Mod+-'],
  table: ['Mod+T'],
  codeBlock: ['Mod+Shift+K'],
  mathBlock: ['Mod+Shift+M'],
  quote: ['Mod+Shift+Q'],
  orderedList: ['Mod+Shift+['],
  bulletList: ['Mod+Shift+]'],
  indent: ['Mod+]'],
  outdent: ['Mod+['],
  bold: ['Mod+B'],
  italic: ['Mod+I'],
  underline: ['Mod+U'],
  inlineCode: ['Mod+Shift+`'],
  strike: ['Alt+Shift+5'],
  link: ['Mod+K'],
  image: ['Mod+Shift+I'],
  clearFormat: ['Mod+\\'],
  toggleSource: ['Mod+/'],
  toggleSplit: ['Mod+Alt+/'],
  zoomIn: ['Mod+Shift+='],
  zoomOut: ['Mod+Shift+-'],
  zoomReset: ['Mod+Shift+0'],
  fullscreen: ['F11'],
};

export type MenuEntry = CommandId | '-';

export interface MenuDef {
  id: string;
  label: MessageKey;
  items: MenuEntry[];
}

export const MENUS: MenuDef[] = [
  {
    id: 'file',
    label: 'menu.file',
    items: ['newFile', 'openFile', '-', 'save', 'saveAs', '-', 'closeWindow'],
  },
  {
    id: 'edit',
    label: 'menu.edit',
    items: ['undo', 'redo', '-', 'selectAll', 'selectWord', 'selectLine', 'selectScope', '-', 'deleteWord'],
  },
  {
    id: 'paragraph',
    label: 'menu.paragraph',
    items: [
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
      '-',
      'paragraph',
      '-',
      'headingUp',
      'headingDown',
      '-',
      'table',
      'codeBlock',
      'mathBlock',
      '-',
      'quote',
      '-',
      'orderedList',
      'bulletList',
      'taskList',
      '-',
      'indent',
      'outdent',
      '-',
      'horizontalRule',
    ],
  },
  {
    id: 'format',
    label: 'menu.format',
    items: [
      'bold',
      'italic',
      'underline',
      'inlineCode',
      '-',
      'strike',
      '-',
      'link',
      'image',
      '-',
      'clearFormat',
    ],
  },
  {
    id: 'view',
    label: 'menu.view',
    items: ['toggleSource', 'toggleSplit', '-', 'zoomIn', 'zoomOut', 'zoomReset', '-', 'fullscreen'],
  },
  { id: 'help', label: 'menu.help', items: ['about'] },
];

export function commandLabel(id: CommandId): MessageKey {
  return `cmd.${id}` as MessageKey;
}

/** Maps canonical shortcut → command. Later entries (user keybindings) override earlier ones. */
export function buildShortcutMap(...layers: Partial<Record<CommandId, string[]>>[]): Map<string, CommandId> {
  const map = new Map<string, CommandId>();
  for (const layer of layers) {
    for (const [id, shortcuts] of Object.entries(layer) as [CommandId, string[]][]) {
      for (const shortcut of shortcuts) map.set(normalizeShortcut(shortcut), id);
    }
  }
  return map;
}
