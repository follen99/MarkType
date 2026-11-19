import type { PrefsApi } from '@marktype/platform';

export type SidebarTab = 'files' | 'outline' | 'search';

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;

/** Sidebar visibility, active tab and width, remembered between sessions. */
export class SidebarState {
  visible = $state(true);
  tab = $state<SidebarTab>('outline');
  width = $state(260);
  /** Incremented to ask the search panel to focus its input. */
  focusSearch = $state(0);

  constructor(private prefs: PrefsApi) {
    this.visible = prefs.get('sidebar.visible', true);
    this.tab = prefs.get<SidebarTab>('sidebar.tab', 'outline');
    this.width = prefs.get('sidebar.width', 260);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.prefs.set('sidebar.visible', this.visible);
  }

  show(tab: SidebarTab): void {
    // Pressing the shortcut of the tab already shown hides the sidebar (Typora behavior).
    if (this.visible && this.tab === tab && tab !== 'search') {
      this.toggle();
      return;
    }
    this.tab = tab;
    this.visible = true;
    this.prefs.set('sidebar.tab', tab);
    this.prefs.set('sidebar.visible', true);
    if (tab === 'search') this.focusSearch++;
  }

  resize(width: number): void {
    this.width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
  }

  commitWidth(): void {
    this.prefs.set('sidebar.width', this.width);
  }
}
