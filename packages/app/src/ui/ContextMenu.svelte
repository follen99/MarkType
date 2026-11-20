<script lang="ts">
  import type { ContextMenuState } from './contextmenu.svelte.ts';

  let { menu }: { menu: ContextMenuState } = $props();
  let panel = $state<HTMLElement | null>(null);
  let position = $state({ x: 0, y: 0 });
  const checkable = $derived(
    menu.open?.items.some((item) => typeof item === 'object' && 'run' in item && item.checked) ?? false,
  );

  $effect(() => {
    const open = menu.open;
    if (!open) return;
    position = { x: open.x, y: open.y };
    // Keep the menu inside the window (menus of bottom buttons open upwards).
    queueMicrotask(() => {
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const y = open.above ? open.y - rect.height : open.y;
      position = {
        x: Math.max(8, Math.min(open.x, window.innerWidth - rect.width - 8)),
        y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
      };
      panel.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    });
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return moveFocus(event);
        if (event.key !== 'Escape') return;
      }
      if (event.type === 'pointerdown' && panel?.contains(event.target as Node)) return;
      menu.close();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('blur', close);
    };
  });

  function moveFocus(event: KeyboardEvent) {
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  }
</script>

{#if menu.open}
  <div
    class="mt-menu-panel mt-context-menu"
    role="menu"
    bind:this={panel}
    style:left="{position.x}px"
    style:top="{position.y}px"
  >
    {#each menu.open.items as item, index (index)}
      {#if item === '-'}
        <div class="mt-menu-separator" role="separator"></div>
      {:else if 'header' in item}
        <div class="mt-menu-header" role="presentation">{item.header}</div>
      {:else}
        <button
          class="mt-menu-item"
          class:checkable
          class:danger={item.danger}
          role={checkable ? 'menuitemradio' : 'menuitem'}
          aria-checked={checkable ? (item.checked ?? false) : undefined}
          disabled={item.disabled}
          title={item.detail}
          onclick={() => {
            menu.close();
            item.run();
          }}
        >
          <span class="mt-menu-label">
            {#if checkable}<span class="mt-menu-check" aria-hidden="true">{item.checked ? '✓' : ''}</span
              >{/if}{item.label}
          </span>
          {#if item.detail}<span class="mt-menu-detail">{item.detail}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}
