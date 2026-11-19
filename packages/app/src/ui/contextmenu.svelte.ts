export interface ContextMenuItem {
  label: string;
  run: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | '-';

/** One context menu at a time, positioned at the pointer. */
export class ContextMenuState {
  open = $state<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  show(event: MouseEvent, items: ContextMenuEntry[]): void {
    event.preventDefault();
    event.stopPropagation();
    this.open = { x: event.clientX, y: event.clientY, items };
  }

  close(): void {
    this.open = null;
  }
}
