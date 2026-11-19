<script lang="ts">
  import type { Platform } from '@marktype/platform';
  import type { Translate } from '@marktype/i18n';
  import logoUrl from '../assets/logo.svg';

  let { platform, t, title }: { platform: Platform; t: Translate; title: string } = $props();

  let maximized = $state(false);

  $effect(() => {
    void platform.window.setTitle(title);
  });

  $effect(() => {
    if (!platform.capabilities.windowControls) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    const refresh = async () => {
      maximized = await platform.window.isMaximized();
    };
    void refresh();
    void platform.window.onResized(refresh).then((off) => {
      if (cancelled) off();
      else unsubscribe = off;
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  });

  // Native window controls are drawn by the OS on macOS (traffic lights).
  const showControls = $derived(platform.capabilities.windowControls && platform.os !== 'macos');
</script>

<header id="mt-titlebar">
  <div class="mt-titlebar-drag" data-tauri-drag-region>
    <img class="mt-titlebar-logo" src={logoUrl} alt="" draggable="false" data-tauri-drag-region />
    <span class="mt-titlebar-title" data-tauri-drag-region>{title}</span>
  </div>

  {#if showControls}
    <div class="mt-window-controls">
      <button
        class="mt-window-button"
        title={t('window.minimize')}
        aria-label={t('window.minimize')}
        onclick={() => platform.window.minimize()}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" stroke="currentColor" /></svg>
      </button>
      <button
        class="mt-window-button"
        title={maximized ? t('window.restore') : t('window.maximize')}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        onclick={() => platform.window.toggleMaximize()}
      >
        {#if maximized}
          <svg viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor">
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" />
            <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" />
          </svg>
        {:else}
          <svg viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor">
            <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />
          </svg>
        {/if}
      </button>
      <button
        class="mt-window-button mt-close"
        title={t('window.close')}
        aria-label={t('window.close')}
        onclick={() => platform.window.close()}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
        </svg>
      </button>
    </div>
  {/if}
</header>
