import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  selectedRect,
} from 'prosemirror-tables';

type Align = 'left' | 'center' | 'right' | null;

/** Sets the alignment of the columns touched by the selection (GFM aligns whole columns). */
export function setColumnAlign(align: Align): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (dispatch) {
      const rect = selectedRect(state);
      const tr = state.tr;
      for (let row = 0; row < rect.map.height; row++) {
        for (let col = rect.left; col < rect.right; col++) {
          const pos = rect.tableStart + rect.map.map[row * rect.map.width + col]!;
          const cell = tr.doc.nodeAt(pos);
          if (cell && cell.attrs.align !== align) tr.setNodeMarkup(pos, undefined, { ...cell.attrs, align });
        }
      }
      dispatch(tr);
    }
    return true;
  };
}

/** The header row is mandatory in GFM tables: never delete it. */
const deleteBodyRow: Command = (state, dispatch) => {
  if (!isInTable(state) || selectedRect(state).top === 0) return false;
  return deleteRow(state, dispatch);
};

const addRowBelow: Command = (state, dispatch) => addRowAfter(state, dispatch);
const addRowAbove: Command = (state, dispatch) =>
  isInTable(state) && selectedRect(state).top === 0 ? false : addRowBefore(state, dispatch);

export const tableCommands = { addRowBelow, addRowAbove, deleteBodyRow };

const ICONS: Record<string, string> = {
  left: 'M2 3h12M2 6.5h8M2 10h12M2 13.5h8',
  center: 'M2 3h12M4 6.5h8M2 10h12M4 13.5h8',
  right: 'M2 3h12M6 6.5h8M2 10h12M6 13.5h8',
  rowAbove: 'M2 9h12v5H2zM8 2v5M5.5 4.5h5',
  rowBelow: 'M2 2h12v5H2zM8 9v5M5.5 11.5h5',
  colLeft: 'M9 2h5v12H9zM2 8h5M4.5 5.5v5',
  colRight: 'M2 2h5v12H2zM9 8h5M11.5 5.5v5',
  deleteRow: 'M2 5h12v6H2zM6 7l4 2M10 7l-4 2',
  deleteCol: 'M5 2h6v12H5zM7 6l2 4M9 6l-2 4',
  deleteTable: 'M3 4h10M6 4V2.5h4V4M4.5 4l.7 9.5h5.6l.7-9.5',
};

interface ToolDef {
  icon: string;
  title: string;
  command: Command;
  active?: (state: EditorState) => boolean;
}

function columnAlign(state: EditorState): Align {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const cell = state.doc.nodeAt(rect.tableStart + rect.map.map[rect.left]!);
  return (cell?.attrs.align as Align) ?? null;
}

const TOOLS: ToolDef[] = [
  {
    icon: 'left',
    title: 'Align left',
    command: setColumnAlign('left'),
    active: (s) => columnAlign(s) === 'left',
  },
  {
    icon: 'center',
    title: 'Align center',
    command: setColumnAlign('center'),
    active: (s) => columnAlign(s) === 'center',
  },
  {
    icon: 'right',
    title: 'Align right',
    command: setColumnAlign('right'),
    active: (s) => columnAlign(s) === 'right',
  },
  { icon: 'rowAbove', title: 'Insert row above', command: addRowAbove },
  { icon: 'rowBelow', title: 'Insert row below (Ctrl+Enter)', command: addRowBelow },
  { icon: 'colLeft', title: 'Insert column left', command: addColumnBefore },
  { icon: 'colRight', title: 'Insert column right', command: addColumnAfter },
  { icon: 'deleteRow', title: 'Delete row', command: deleteBodyRow },
  { icon: 'deleteCol', title: 'Delete column', command: deleteColumn },
  { icon: 'deleteTable', title: 'Delete table', command: deleteTable },
];

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.appendChild(path);
  return svg;
}

/** Table wrapped in Typora's `figure.md-table-fig`, with a toolbar shown while the cursor is inside. */
export class TableView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private toolbar: HTMLElement;
  private buttons: { el: HTMLButtonElement; tool: ToolDef }[] = [];

  constructor(
    private node: PMNode,
    private view: EditorView,
  ) {
    this.dom = document.createElement('figure');
    this.dom.className = 'md-table-fig';
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'md-table-edit';
    this.toolbar.contentEditable = 'false';
    for (const tool of TOOLS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `md-table-tool md-table-tool-${tool.icon}`;
      el.title = tool.title;
      el.appendChild(icon(tool.icon));
      el.addEventListener('mousedown', (event) => {
        event.preventDefault();
        tool.command(this.view.state, this.view.dispatch, this.view);
        this.view.focus();
      });
      this.buttons.push({ el, tool });
      this.toolbar.appendChild(el);
      if (tool.icon === 'right' || tool.icon === 'rowBelow' || tool.icon === 'colRight') {
        const sep = document.createElement('span');
        sep.className = 'md-table-tool-sep';
        this.toolbar.appendChild(sep);
      }
    }
    const table = document.createElement('table');
    table.className = 'md-table';
    this.contentDOM = document.createElement('tbody');
    table.appendChild(this.contentDOM);
    this.dom.append(this.toolbar, table);
    this.toolbar.hidden = !view.editable;
  }

  /** Called by the table plugin on every state update, to reflect the current column alignment. */
  refresh(state: EditorState): void {
    for (const { el, tool } of this.buttons) el.classList.toggle('active', !!tool.active?.(state));
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.refresh(this.view.state);
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return this.toolbar.contains(event.target as Node);
  }
}

/** Node view factory + plugin keeping every toolbar's alignment buttons in sync with the selection. */
export function tableSupport() {
  const views = new Set<TableView>();
  return {
    nodeView: (node: PMNode, view: EditorView) => {
      const tableView = new TableView(node, view);
      views.add(tableView);
      const destroy = () => views.delete(tableView);
      return Object.assign(tableView, { destroy });
    },
    plugin: new Plugin({
      view: () => ({
        update(view) {
          if (views.size && isInTable(view.state)) for (const v of views) v.refresh(view.state);
        },
      }),
    }),
  };
}
