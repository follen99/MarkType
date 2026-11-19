<script lang="ts">
  import { isEditorCommand } from '@marktype/editor';
  import type { Platform } from '@marktype/platform';
  import type { Translate } from '@marktype/i18n';
  import TitleBar from './chrome/TitleBar.svelte';
  import MenuBar from './chrome/MenuBar.svelte';
  import StatusBar from './chrome/StatusBar.svelte';
  import DialogHost from './chrome/DialogHost.svelte';
  import Tabs from './chrome/Tabs.svelte';
  import QuickOpen from './chrome/QuickOpen.svelte';
  import FindBar, { type FindBarApi } from './chrome/FindBar.svelte';
  import Sidebar from './sidebar/Sidebar.svelte';
  import ContextMenu from './ui/ContextMenu.svelte';
  import { Dialogs } from './dialogs.svelte.ts';
  import { Workspace } from './workspace.svelte.ts';
  import { FileTree } from './filetree.svelte.ts';
  import { FileActions } from './sidebar/fileactions.ts';
  import { SidebarState } from './sidebar/sidebar.svelte.ts';
  import { ContextMenuState } from './ui/contextmenu.svelte.ts';
  import { DEFAULT_KEYBINDINGS, buildShortcutMap, type CommandId } from './commands/registry.ts';
  import { shortcutCandidates } from './commands/keys.ts';

  // `platform` and `t` are fixed for the lifetime of the app, so reading them once is intended.
  let { platform, t }: { platform: Platform; t: Translate } = $props();

  // svelte-ignore state_referenced_locally
  const { folders, prefs } = platform;
  // svelte-ignore state_referenced_locally
  const isMac = platform.os === 'macos' || platform.os === 'ios';
  const dialogs = new Dialogs();
  // svelte-ignore state_referenced_locally
  const workspace = new Workspace(platform, dialogs, t);
  const sidebar = new SidebarState(prefs);
  const menu = new ContextMenuState();
  const tree = folders ? new FileTree(folders) : null;
  // svelte-ignore state_referenced_locally
  const actions = folders && tree ? new FileActions(folders, tree, workspace, dialogs, t) : null;
  const shortcuts = buildShortcutMap(DEFAULT_KEYBINDINGS);

  let quickOpen = $state(false);
  let findBar = $state<FindBarApi | undefined>(undefined);

  const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  let zoom = 1;
  let fullscreen = false;

  const active = $derived(workspace.active);
  const title = $derived(`${active?.dirty ? '• ' : ''}${active?.name ?? ''} — MarkType`);

  function setZoom(next: number) {
    zoom = next;
    void platform.window.setZoom(zoom);
  }

  function stepZoom(direction: 1 | -1) {
    const index = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))] ?? 1;
    setZoom(next);
  }

  async function pickFolder() {
    const path = await folders?.pick();
    if (path) await openFolder(path);
  }

  async function openFolder(path: string) {
    await workspace.openFolder(path);
    await tree?.open(path);
    sidebar.show('files');
  }

  // Closing the folder in the workspace also empties the tree.
  $effect(() => {
    if (!workspace.folder) tree?.close();
  });

  // Reveal the active file in the tree.
  $effect(() => {
    const path = active?.file?.id;
    if (path && tree?.root) void tree.reveal(path);
  });

  function run(id: CommandId) {
    if (isEditorCommand(id)) {
      active?.exec(id);
      return;
    }
    switch (id) {
      case 'newFile':
        return void workspace.newTab();
      case 'openFile':
        return void workspace.pickAndOpen();
      case 'openFolder':
        return void pickFolder();
      case 'quickOpen':
        quickOpen = true;
        return;
      case 'save':
        return void active?.save();
      case 'saveAs':
        return void active?.saveAs();
      case 'toggleAutosave':
        return workspace.toggleAutosave();
      case 'closeTab':
        return void workspace.closeTab();
      case 'reopenTab':
        return void workspace.reopenClosed();
      case 'nextTab':
        return workspace.cycle(1);
      case 'prevTab':
        return workspace.cycle(-1);
      case 'closeWindow':
        // The close guard (below) asks about unsaved changes.
        return void platform.window.close();
      case 'find':
        return findBar?.open(false);
      case 'replace':
        return findBar?.open(true);
      case 'findNext':
        return findBar?.run('next');
      case 'findPrev':
        return findBar?.run('prev');
      case 'showSearch':
        return sidebar.show('search');
      case 'toggleSidebar':
        return sidebar.toggle();
      case 'showOutline':
        return sidebar.show('outline');
      case 'showFiles':
        return sidebar.show('files');
      case 'toggleSource':
        return workspace.toggleMode('source');
      case 'toggleSplit':
        return workspace.toggleMode('split');
      case 'cycleMode':
        return workspace.cycleMode();
      case 'zoomIn':
        return stepZoom(1);
      case 'zoomOut':
        return stepZoom(-1);
      case 'zoomReset':
        return setZoom(1);
      case 'fullscreen':
        fullscreen = !fullscreen;
        return void platform.window.setFullscreen(fullscreen);
      case 'about':
        return void dialogs
          .alert('MarkType', t('about.message', { version: platform.appVersion }), t('dialog.ok'))
          .then(() => active?.focus());
    }
  }

  function shortcutOf(id: CommandId): string | undefined {
    return DEFAULT_KEYBINDINGS[id]?.[0];
  }

  function isChecked(id: CommandId): boolean | undefined {
    switch (id) {
      case 'toggleAutosave':
        return workspace.autosave;
      case 'toggleSidebar':
        return sidebar.visible;
      case 'toggleSource':
        return active?.mode === 'source';
      case 'toggleSplit':
        return active?.mode === 'split';
      default:
        return undefined;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (dialogs.current || event.isComposing) return;
    let id: CommandId | undefined;
    for (const candidate of shortcutCandidates(event, isMac)) {
      id = shortcuts.get(candidate);
      if (id) break;
    }
    if (!id) return;
    // In text fields (find bar, sidebar search…) editing shortcuts keep their native meaning.
    const target = event.target as HTMLElement | null;
    const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (inField && isEditorCommand(id)) return;
    event.preventDefault();
    event.stopPropagation();
    run(id);
  }

  function mountWorkspace(node: HTMLElement) {
    workspace.attach(node);
  }

  // Startup: reopen the last folder, then offer to recover unsaved work after a crash.
  $effect(() => {
    const last = prefs.get<string | null>('lastFolder', null);
    void (async () => {
      if (last && folders) await openFolder(last).catch(() => workspace.closeFolder());
      await workspace.recoverDrafts();
    })();
  });

  $effect(() => {
    let off: (() => void) | undefined;
    void platform.window
      .onCloseRequested({
        hasUnsavedChanges: () => workspace.hasUnsaved(),
        confirmClose: () => workspace.confirmCloseAll(),
      })
      .then((unsubscribe) => (off = unsubscribe));
    return () => off?.();
  });

  function onWindowFocus() {
    void tree?.refresh();
  }

  function onWindowBlur() {
    workspace.flushAutosave();
  }
</script>

<svelte:window onkeydowncapture={onKeydown} onfocus={onWindowFocus} onblur={onWindowBlur} />

<div id="mt-root">
  <TitleBar {platform} {t} {title}>
    {#snippet menu()}
      <MenuBar {t} {isMac} {shortcutOf} {isChecked} {run} />
    {/snippet}
  </TitleBar>
  <div class="mt-body" class:sidebar-hidden={!sidebar.visible}>
    {#if sidebar.visible}
      <Sidebar {sidebar} {workspace} {tree} {actions} {folders} {menu} {t} {pickFolder} />
    {/if}
    <div class="mt-content">
      <Tabs {workspace} {t} />
      <div class="mt-editor-area">
        <FindBar doc={active} {t} bind:api={findBar} />
        <main id="mt-main" use:mountWorkspace></main>
      </div>
    </div>
  </div>
  <StatusBar doc={active} {t} onModeClick={() => workspace.cycleMode()} />
</div>

<QuickOpen bind:open={quickOpen} {workspace} {folders} {t} />
<ContextMenu {menu} />
<DialogHost {dialogs} />
