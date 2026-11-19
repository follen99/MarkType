<script lang="ts">
  import { isEditorCommand } from '@marktype/editor';
  import type { Platform } from '@marktype/platform';
  import type { Translate } from '@marktype/i18n';
  import TitleBar from './chrome/TitleBar.svelte';
  import MenuBar from './chrome/MenuBar.svelte';
  import StatusBar from './chrome/StatusBar.svelte';
  import DialogHost from './chrome/DialogHost.svelte';
  import { Dialogs } from './dialogs.svelte.ts';
  import { DocumentController } from './document.svelte.ts';
  import { DEFAULT_KEYBINDINGS, buildShortcutMap, type CommandId } from './commands/registry.ts';
  import { shortcutFromEvent } from './commands/keys.ts';

  // `platform` and `t` are fixed for the lifetime of the app, so reading them once is intended.
  let { platform, t }: { platform: Platform; t: Translate } = $props();

  // svelte-ignore state_referenced_locally
  const isMac = platform.os === 'macos' || platform.os === 'ios';
  const dialogs = new Dialogs();
  // svelte-ignore state_referenced_locally
  const doc = new DocumentController(platform, dialogs, t);
  const shortcuts = buildShortcutMap(DEFAULT_KEYBINDINGS);

  const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  let zoom = 1;
  let fullscreen = false;

  const title = $derived(`${doc.dirty ? '• ' : ''}${doc.name} — MarkType`);

  function setZoom(next: number) {
    zoom = next;
    void platform.window.setZoom(zoom);
  }

  function stepZoom(direction: 1 | -1) {
    const index = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))] ?? 1;
    setZoom(next);
  }

  async function closeWindow() {
    // The close guard (below) asks about unsaved changes.
    await platform.window.close();
  }

  function run(id: CommandId) {
    if (isEditorCommand(id)) {
      doc.exec(id);
      return;
    }
    switch (id) {
      case 'newFile':
        return void doc.newDocument();
      case 'openFile':
        return void doc.open();
      case 'save':
        return void doc.save();
      case 'saveAs':
        return void doc.saveAs();
      case 'closeWindow':
        return void closeWindow();
      case 'toggleSource':
        return doc.toggleMode('source');
      case 'toggleSplit':
        return doc.toggleMode('split');
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
          .then(() => doc.focus());
    }
  }

  function shortcutOf(id: CommandId): string | undefined {
    return DEFAULT_KEYBINDINGS[id]?.[0];
  }

  function onKeydown(event: KeyboardEvent) {
    if (dialogs.current || event.isComposing) return;
    const shortcut = shortcutFromEvent(event, isMac);
    const id = shortcut ? shortcuts.get(shortcut) : undefined;
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    run(id);
  }

  function mountEditor(node: HTMLElement) {
    doc.attach(node);
    return { destroy: () => doc.detach() };
  }

  $effect(() => {
    let off: (() => void) | undefined;
    void platform.window
      .onCloseRequested({
        hasUnsavedChanges: () => doc.dirty,
        confirmClose: () => doc.confirmDiscard(),
      })
      .then((unsubscribe) => (off = unsubscribe));
    return () => off?.();
  });
</script>

<svelte:window onkeydowncapture={onKeydown} />

<div id="mt-root">
  <TitleBar {platform} {t} {title}>
    {#snippet menu()}
      <MenuBar {t} {isMac} {shortcutOf} {run} />
    {/snippet}
  </TitleBar>
  <main id="mt-main" use:mountEditor></main>
  <StatusBar {doc} {t} />
</div>

<DialogHost {dialogs} />
