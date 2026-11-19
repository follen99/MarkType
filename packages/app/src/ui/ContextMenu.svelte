<script lang="ts">
  import type { ContextMenuState } from './contextmenu.svelte.ts';

  let { menu }: { menu: ContextMenuState } = $props();
  let panel = $state<HTMLElement | null>(null);
  let position = $state({ x: 0, y: 0 });

  $effect(() => {
    const open = menu.open;
    if (!open) return;
    position = { x: open.x, y: open.y };
    // Keep the menu inside the window.
    queueMicrotask(() => {
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      position = {
        x: Math.min(open.x, window.innerWidth - rect.width - 8),
        y: Math.min(open.y, window.innerHeight - rect.height - 8),
      };
      panel.querySelector<HTMLElement>('button')?.focus();
    });
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
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
      {:else}
        <button
          class="mt-menu-item"
          class:danger={item.danger}
          role="menuitem"
          disabled={item.disabled}
          onclick={() => {
            menu.close();
            item.run();
          }}
        >
          <span>{item.label}</span>
        </button>
      {/if}
    {/each}
  </div>
{/if}
