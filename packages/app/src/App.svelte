<script lang="ts">
  import { isEditorCommand } from '@marktype/editor';
  import { basename, dirname, isInside, type LaunchPath, type Platform } from '@marktype/platform';
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
  import SettingsDialog from './chrome/SettingsDialog.svelte';
  import type { AppSettings, ExportFormat } from './settings.svelte.ts';
  import type { SlotItem } from './chrome/MenuBar.svelte';
  import type { ThemeManager } from './theme.svelte.ts';
  import { Dialogs } from './dialogs.svelte.ts';
  import { Workspace } from './workspace.svelte.ts';
  import { FileTree } from './filetree.svelte.ts';
  import { FileActions } from './sidebar/fileactions.ts';
  import { SidebarState } from './sidebar/sidebar.svelte.ts';
  import { ContextMenuState, type ContextMenuEntry } from './ui/contextmenu.svelte.ts';
  import { parseSession, planRestore, samePath } from './session.ts';
  import type { DocumentController } from './document.svelte.ts';
  import {
    DEFAULT_KEYBINDINGS,
    buildShortcutMap,
    effectiveKeybindings,
    parseUserKeybindings,
    type CommandId,
    type MenuSlot,
  } from './commands/registry.ts';
  import { normalizeShortcut, shortcutCandidates } from './commands/keys.ts';
  import { DEFAULT_IMAGE_SETTINGS, isImageName, type ImageDestination, type ImageInput } from './images.ts';

  const MARKDOWN_FILE = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;
  const PANDOC_COMMANDS = new Set<CommandId>([
    'exportDocx',
    'exportOdt',
    'exportRtf',
    'exportEpub',
    'exportLatex',
  ]);

  // `platform`, `t` and `themes` are fixed for the lifetime of the app, so reading them once is intended.
  let {
    platform,
    t,
    themes,
    settings,
  }: { platform: Platform; t: Translate; themes: ThemeManager; settings: AppSettings } = $props();

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
  // Defaults until keybindings.json is read (startup, below).
  let keybindings = $state(DEFAULT_KEYBINDINGS);
  const shortcuts = $derived(buildShortcutMap(keybindings));

  let quickOpen = $state(false);
  let settingsOpen = $state(false);
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

  /** Opens a folder in the sidebar; `reveal` shows the Files panel (not when restoring the session). */
  async function openFolder(path: string, reveal = true) {
    await workspace.openFolder(path);
    await tree?.open(path);
    if (reveal) sidebar.reveal('files');
  }

  /** A folder from the recent list: one deleted meanwhile is dropped from the list. */
  async function openRecentFolder(path: string) {
    if (!folders) return;
    if ((await folders.exists(path)) !== 'dir') {
      workspace.forget([path]);
      await dialogs.alert(
        t('recentFolders.missing.title'),
        t('recentFolders.missing', { path }),
        t('dialog.ok'),
      );
      return;
    }
    await openFolder(path).catch(() => workspace.closeFolder());
  }

  // Menus of the buttons at the bottom of the sidebar.
  function newMenu(): ContextMenuEntry[] {
    const root = tree?.root;
    const items: ContextMenuEntry[] = [{ label: t('sidebar.footer.newDocument'), run: () => run('newFile') }];
    if (root && actions)
      items.push(
        '-',
        { header: basename(root) || root },
        { label: t('files.newFileHere'), run: () => void actions.newFile(root) },
        { label: t('files.newFolder'), run: () => void actions.newFolder(root) },
      );
    return items;
  }

  function folderMenu(): ContextMenuEntry[] {
    const current = workspace.folder;
    const items: ContextMenuEntry[] = [{ label: t('cmd.openFolder'), run: () => run('openFolder') }];
    items.push('-', { header: t('recentFolders.title') });
    if (workspace.recentFolders.length) {
      for (const path of workspace.recentFolders)
        items.push({
          label: basename(path) || path,
          detail: dirname(path),
          checked: current !== null && samePath(current, path),
          run: () => void openRecentFolder(path),
        });
      items.push('-', { label: t('recentFolders.clear'), run: () => workspace.clearRecentFolders() });
    } else {
      items.push({ label: t('recentFolders.empty'), run: () => {}, disabled: true });
    }
    items.push({ label: t('sidebar.closeFolder'), run: () => workspace.closeFolder(), disabled: !current });
    return items;
  }

  // Right click on a tab.
  function tabMenu(event: MouseEvent, doc: DocumentController) {
    const path = doc.file?.id;
    const items: ContextMenuEntry[] = [];
    if (path && folders) {
      items.push(
        { label: t('tabs.revealFolder'), run: () => void revealFileFolder(path) },
        { label: t('files.copyPath'), run: () => void navigator.clipboard?.writeText(path).catch(() => {}) },
        '-',
      );
    }
    items.push(
      { label: t('tabs.close'), run: () => void workspace.closeTab(doc) },
      {
        label: t('tabs.closeOthers'),
        run: () => void workspace.closeOthers(doc),
        disabled: workspace.docs.length < 2,
      },
    );
    menu.show(event, items);
  }

  /** "Open the file's folder": inside the open folder it is shown in the tree, otherwise opened. */
  async function revealFileFolder(path: string) {
    const root = workspace.folder;
    if (root && tree && isInside(path, root)) {
      sidebar.reveal('files');
      await tree.reveal(path);
      return;
    }
    const dir = dirname(path);
    if (root) {
      const choice = await dialogs.confirm(
        t('tabs.replaceFolder.title'),
        t('tabs.replaceFolder.message', { folder: dir, current: root }),
        [
          { id: 'cancel', label: t('dialog.cancel'), cancel: true },
          { id: 'open', label: t('tabs.replaceFolder.open'), primary: true },
        ],
      );
      if (choice !== 'open') return;
    }
    await openFolder(dir).catch(() => workspace.closeFolder());
    await tree?.reveal(path);
  }

  // Remember the open tabs (restored at the next start).
  $effect(() => {
    void workspace.docs.map((doc) => doc.file?.id);
    void workspace.activeId;
    workspace.saveSession();
  });

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
      case 'exportHtml':
        return void runExport('html');
      case 'exportPdf':
        return void runExport('pdf');
      case 'exportDocx':
        return void runExport('docx');
      case 'exportOdt':
        return void runExport('odt');
      case 'exportRtf':
        return void runExport('rtf');
      case 'exportEpub':
        return void runExport('epub');
      case 'exportLatex':
        return void runExport('latex');
      case 'preferences':
        settingsOpen = true;
        return;
      case 'openKeybindings':
        return void platform.config?.openFile('keybindings');
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
      case 'followSystemTheme':
        return themes.toggleFollowSystem();
      case 'insertImageFile':
        return void insertImageFiles();
      case 'openThemesFolder':
        return themes.openFolder();
      case 'about':
        return void dialogs
          .alert('MarkType', t('about.message', { version: platform.appVersion }), t('dialog.ok'))
          .then(() => active?.focus());
    }
  }

  async function runExport(format: ExportFormat) {
    const doc = active;
    if (!doc) return;
    const { exportDocument } = await import('./export.ts');
    await exportDocument(
      {
        platform,
        dialogs,
        t,
        doc,
        css: { theme: themes.active, baseUserCssUrl: themes.baseUserCssUrl },
        settings: settings.exportSettings,
      },
      format,
    );
  }

  function pathInput(path: string): ImageInput {
    return { name: basename(path), type: '', path, read: () => platform.images!.read(path) };
  }

  async function insertImageFiles() {
    const paths = (await platform.images?.pick()) ?? [];
    if (paths.length) await active?.insertImages(paths.map(pathInput));
  }

  // Files dropped from the file manager (desktop): images go in the document, markdown files open.
  $effect(() => {
    let off: (() => void) | undefined;
    void platform.window
      .onFileDrop(({ paths, x, y }) => {
        const images = paths.filter(isImageName);
        if (images.length) void active?.insertImages(images.map(pathInput), { x, y });
        for (const path of paths) if (MARKDOWN_FILE.test(path)) void workspace.openPath(path);
      })
      .then((unsubscribe) => (off = unsubscribe));
    return () => off?.();
  });

  async function askImageSetting(field: 'pattern' | 'customFolder') {
    const pattern = field === 'pattern';
    const value = await dialogs.prompt(
      t(pattern ? 'image.pattern.title' : 'image.folder.title'),
      t(pattern ? 'image.pattern.label' : 'image.folder.label'),
      workspace.imageSettings[field] || (pattern ? DEFAULT_IMAGE_SETTINGS.pattern : './img'),
      t('dialog.ok'),
      t('dialog.cancel'),
    );
    if (value === null || !value.trim()) return;
    workspace.setImageSettings(
      pattern ? { pattern: value.trim() } : { customFolder: value.trim(), destination: 'custom' },
    );
  }

  // Format menu: where images are copied and how they are named (docs/SPEC.md §10).
  function imageSlotItems(): SlotItem[] {
    if (!platform.images) return [];
    const settings = workspace.imageSettings;
    const destination = (id: ImageDestination, label: string, run?: () => void): SlotItem => ({
      kind: 'item',
      key: `image-${id}`,
      label,
      checked: settings.destination === id,
      run: run ?? (() => workspace.setImageSettings({ destination: id })),
    });
    return [
      { kind: 'header', label: t('image.whenInsert') },
      destination('assets', t('image.dest.assets')),
      destination('filenameAssets', t('image.dest.filenameAssets')),
      destination(
        'custom',
        settings.customFolder
          ? t('image.dest.customSet', { folder: settings.customFolder })
          : t('image.dest.custom'),
        () => void askImageSetting('customFolder'),
      ),
      destination('none', t('image.dest.none')),
      {
        kind: 'item',
        key: 'image-ask-name',
        label: t('image.askName'),
        checked: settings.askName,
        run: () => workspace.setImageSettings({ askName: !settings.askName }),
      },
      {
        kind: 'item',
        key: 'image-pattern',
        label: t('image.pattern'),
        checked: false,
        run: () => void askImageSetting('pattern'),
      },
    ];
  }

  // File menu: the recent folders (the open one checked).
  function recentFolderSlotItems(): SlotItem[] {
    if (!folders || !workspace.recentFolders.length) return [];
    const current = workspace.folder;
    return [
      { kind: 'header', label: t('recentFolders.title') },
      ...workspace.recentFolders.map((path): SlotItem => ({
        kind: 'item',
        key: `folder-${path}`,
        label: basename(path) || path,
        checked: current !== null && samePath(current, path),
        run: () => void openRecentFolder(path),
      })),
      {
        kind: 'item',
        key: 'folder-clear',
        label: t('recentFolders.clear'),
        checked: false,
        run: () => workspace.clearRecentFolders(),
      },
    ];
  }

  /** First shortcut of `id` that really runs it (a user binding may have taken it for another command). */
  function shortcutOf(id: CommandId): string | undefined {
    return keybindings[id]?.find((shortcut) => shortcuts.get(normalizeShortcut(shortcut)) === id);
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
      case 'followSystemTheme':
        return themes.followSystem;
      default:
        return undefined;
    }
  }

  function isVisible(id: CommandId): boolean {
    if (id === 'openThemesFolder') return platform.themes !== null;
    if (id === 'insertImageFile') return platform.images !== null;
    if (id === 'openKeybindings') return platform.config !== null;
    if (PANDOC_COMMANDS.has(id)) return platform.export.pandoc !== null;
    return true;
  }

  // Themes menu: light and dark themes in two groups, so "follow system" shows one choice per group.
  function slotItems(slot: MenuSlot['slot']): SlotItem[] {
    if (slot === 'images') return imageSlotItems();
    if (slot === 'recentFolders') return recentFolderSlotItems();
    const items: SlotItem[] = [];
    for (const dark of [false, true]) {
      items.push({ kind: 'header', label: t(dark ? 'theme.groupDark' : 'theme.groupLight') });
      for (const theme of themes.all.filter((option) => option.dark === dark)) {
        items.push({
          kind: 'item',
          key: theme.id,
          label: theme.name,
          checked: themes.isSelected(theme),
          run: () => themes.select(theme.id),
        });
      }
    }
    return items;
  }

  function onKeydown(event: KeyboardEvent) {
    if (dialogs.current || settingsOpen || event.isComposing) return;
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

  /** Files and folders from the command line, a double click, "Open with" or a second launch. */
  async function openLaunchPaths(paths: LaunchPath[]) {
    for (const entry of paths) {
      if (entry.isDir) {
        if (folders) await openFolder(entry.path).catch(() => undefined);
      } else {
        await workspace.openPath(entry.path);
      }
    }
  }

  /**
   * Reopens the last folder and the files of the last session. What was deleted meanwhile is skipped,
   * forgotten (session, last folder, recent lists) and listed in one alert.
   */
  async function restoreSession(last: string | null) {
    if (!folders) return;
    const plan = await planRestore(last, parseSession(prefs.get<unknown>('session', null)), (path) =>
      folders.exists(path),
    );
    if (plan.folder) await openFolder(plan.folder, false).catch(() => workspace.closeFolder());
    await workspace.restoreSession(plan.files, plan.active);
    if (!plan.missing.length) return;
    workspace.forget(plan.missing);
    await dialogs.alert(
      t('session.missing.title'),
      t('session.missing', { count: plan.missing.length, paths: plan.missing.join('\n') }),
      t('dialog.ok'),
    );
  }

  async function loadKeybindings() {
    if (!platform.config) return;
    try {
      const { bindings, invalid } = parseUserKeybindings(await platform.config.keybindings());
      keybindings = effectiveKeybindings(bindings);
      if (invalid.length)
        await dialogs.alert(
          'MarkType',
          t('keybindings.invalid', { keys: invalid.join(', ') }),
          t('dialog.ok'),
        );
    } catch (error) {
      await dialogs.alert('MarkType', t('keybindings.error', { message: String(error) }), t('dialog.ok'));
    }
  }

  // Startup: open what the OS passed (or reopen the last folder), then offer to recover unsaved work.
  $effect(() => {
    const last = prefs.get<string | null>('lastFolder', null);
    let off: (() => void) | undefined;
    let stopped = false;
    void (async () => {
      const launch = platform.launch;
      if (launch) {
        const unsubscribe = await launch.onOpen((paths) => void openLaunchPaths(paths));
        if (stopped) unsubscribe();
        else off = unsubscribe;
      }
      const initial = (await launch?.initial().catch(() => [])) ?? [];
      if (initial.length) await openLaunchPaths(initial);
      else if (folders && settings.restoreFolder) await restoreSession(last);
      workspace.startSession();
      const error = platform.config?.settingsError;
      if (error)
        await dialogs.alert('MarkType', t('settings.invalidFile', { message: error }), t('dialog.ok'));
      await loadKeybindings();
      await workspace.recoverDrafts();
    })();
    return () => {
      stopped = true;
      off?.();
    };
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
      <MenuBar {t} {isMac} {shortcutOf} {isChecked} {isVisible} {slotItems} {run} />
    {/snippet}
  </TitleBar>
  <div class="mt-body" class:sidebar-hidden={!sidebar.visible}>
    {#if sidebar.visible}
      <Sidebar
        {sidebar}
        {workspace}
        {tree}
        {actions}
        {folders}
        {menu}
        {t}
        {pickFolder}
        {newMenu}
        {folderMenu}
        openSettings={() => run('preferences')}
      />
    {/if}
    <div class="mt-content">
      <Tabs {workspace} {t} oncontextmenu={tabMenu} />
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
<SettingsDialog
  bind:open={settingsOpen}
  {platform}
  {workspace}
  {settings}
  {themes}
  {t}
  onclose={() => active?.focus()}
/>
<DialogHost {dialogs} />
