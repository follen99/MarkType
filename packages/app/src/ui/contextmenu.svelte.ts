export interface ContextMenuItem {
  label: string;
  run: () => void;
  /** Secondary text (e.g. the folder that contains a recent item). */
  detail?: string;
  /** Shows a check mark (e.g. the folder open now). */
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | '-' | { header: string };

export interface OpenMenu {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  /** Open upwards from `y` (menus of the buttons at the bottom of the sidebar). */
  above?: boolean;
}

/** One context menu at a time, positioned at the pointer or next to a button. */
export class ContextMenuState {
  open = $state<OpenMenu | null>(null);
  private anchor: HTMLElement | null = null;
  private closedAt = 0;

  show(event: MouseEvent, items: ContextMenuEntry[]): void {
    event.preventDefault();
    event.stopPropagation();
    this.anchor = null;
    this.open = { x: event.clientX, y: event.clientY, items };
  }

  /**
   * A popup menu above `anchor` (a button), aligned with its left edge. Clicking the button again closes
   * it: the press already closed the menu (outside click), so the click must not reopen it.
   */
  toggleAbove(anchor: HTMLElement, items: () => ContextMenuEntry[]): void {
    if (this.anchor === anchor && performance.now() - this.closedAt < 500) {
      this.anchor = null;
      return;
    }
    const rect = anchor.getBoundingClientRect();
    this.anchor = anchor;
    this.open = { x: rect.left, y: rect.top - 4, items: items(), above: true };
  }

  close(): void {
    if (!this.open) return;
    this.open = null;
    this.closedAt = performance.now();
  }
}
