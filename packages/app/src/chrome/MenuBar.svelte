<script lang="ts" module>
  /** An entry generated at runtime for a menu slot (e.g. one per installed theme). */
  export type SlotItem =
    | { kind: 'header'; label: string }
    | { kind: 'item'; key: string; label: string; checked: boolean; run: () => void };
</script>

<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import { MENUS, commandLabel, type CommandId, type MenuSlot } from '../commands/registry.ts';
  import { formatShortcut } from '../commands/keys.ts';

  let {
    t,
    isMac,
    shortcutOf,
    isChecked,
    isVisible,
    slotItems,
    run,
  }: {
    t: Translate;
    isMac: boolean;
    shortcutOf: (id: CommandId) => string | undefined;
    isChecked: (id: CommandId) => boolean | undefined;
    isVisible: (id: CommandId) => boolean;
    slotItems: (slot: MenuSlot['slot']) => SlotItem[];
    run: (id: CommandId) => void;
  } = $props();

  let openMenu = $state<string | null>(null);
  let bar = $state<HTMLElement | null>(null);

  function toggle(id: string) {
    openMenu = openMenu === id ? null : id;
  }

  function choose(id: CommandId) {
    openMenu = null;
    run(id);
  }

  function chooseSlot(item: Extract<SlotItem, { kind: 'item' }>) {
    openMenu = null;
    item.run();
  }

  /** Drops hidden commands, then separators left at the edges or doubled. */
  function visibleEntries(items: (typeof MENUS)[number]['items']) {
    const kept = items.filter((item) =>
      typeof item === 'string' ? item === '-' || isVisible(item) : slotItems(item.slot).length > 0,
    );
    return kept.filter((item, i) => item !== '-' || (i > 0 && i < kept.length - 1 && kept[i - 1] !== '-'));
  }

  $effect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (bar && !bar.contains(event.target as Node)) openMenu = null;
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') openMenu = null;
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('blur', () => (openMenu = null), { once: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeydown, true);
    };
  });
</script>

{#snippet check(checked: boolean)}
  <span class="mt-menu-check" aria-hidden="true">{checked ? '✓' : ''}</span>
{/snippet}

<nav class="mt-menubar" bind:this={bar}>
  {#each MENUS as menu (menu.id)}
    <div class="mt-menu">
      <button
        class="mt-menu-title"
        class:open={openMenu === menu.id}
        aria-haspopup="menu"
        aria-expanded={openMenu === menu.id}
        onclick={() => toggle(menu.id)}
        onpointerenter={() => openMenu && (openMenu = menu.id)}
        onmousedown={(e) => e.preventDefault()}
      >
        {t(menu.label)}
      </button>
      {#if openMenu === menu.id}
        <div class="mt-menu-panel" role="menu">
          {#each visibleEntries(menu.items) as item, index (index)}
            {#if item === '-'}
              <div class="mt-menu-separator" role="separator"></div>
            {:else if typeof item === 'object'}
              {#each slotItems(item.slot) as entry, i (entry.kind === 'item' ? entry.key : `header-${i}`)}
                {#if entry.kind === 'header'}
                  <div class="mt-menu-header" role="presentation">{entry.label}</div>
                {:else}
                  <button
                    class="mt-menu-item checkable"
                    role="menuitemradio"
                    aria-checked={entry.checked}
                    onclick={() => chooseSlot(entry)}
                    onmousedown={(e) => e.preventDefault()}
                  >
                    <span class="mt-menu-label">{@render check(entry.checked)}{entry.label}</span>
                  </button>
                {/if}
              {/each}
            {:else}
              {@const shortcut = shortcutOf(item)}
              {@const checked = isChecked(item)}
              <button
                class="mt-menu-item"
                class:checkable={checked !== undefined}
                role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={checked}
                onclick={() => choose(item)}
                onmousedown={(e) => e.preventDefault()}
              >
                <span class="mt-menu-label">
                  {#if checked !== undefined}{@render check(checked)}{/if}
                  {t(commandLabel(item))}
                </span>
                {#if shortcut}<kbd>{formatShortcut(shortcut, isMac)}</kbd>{/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>
