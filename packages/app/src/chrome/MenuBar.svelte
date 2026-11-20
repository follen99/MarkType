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

  /** Element focused before the menus took the keyboard (the editor), focused again on close. */
  let returnFocus: HTMLElement | null = null;

  function toggle(id: string) {
    openMenu = openMenu === id ? null : id;
  }

  function close() {
    openMenu = null;
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  function choose(id: CommandId) {
    returnFocus = null;
    openMenu = null;
    run(id);
  }

  function chooseSlot(item: Extract<SlotItem, { kind: 'item' }>) {
    returnFocus = null;
    openMenu = null;
    item.run();
  }

  const menuItems = () => [...(bar?.querySelectorAll<HTMLElement>('.mt-menu-panel .mt-menu-item') ?? [])];

  /** Opens a menu from the keyboard and focuses one of its items (first, or last with `-1`). */
  function openWithKeyboard(id: string, item = 0) {
    if (!returnFocus && !bar?.contains(document.activeElement))
      returnFocus = document.activeElement as HTMLElement | null;
    openMenu = id;
    queueMicrotask(() => {
      const items = menuItems();
      items.at(item < 0 ? items.length - 1 : 0)?.focus();
    });
  }

  function moveFocus(step: number, edge?: 'first' | 'last') {
    const items = menuItems();
    if (!items.length) return;
    let index = items.indexOf(document.activeElement as HTMLElement);
    if (edge === 'first') index = 0;
    else if (edge === 'last') index = items.length - 1;
    else index = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
    items[index]!.focus();
  }

  function switchMenu(step: number) {
    const index = MENUS.findIndex((m) => m.id === openMenu);
    const next = MENUS[(index + step + MENUS.length) % MENUS.length]!;
    openWithKeyboard(next.id);
  }

  // Alt pressed and released alone, or F10, opens the first menu (Windows convention).
  $effect(() => {
    let altAlone = false;
    const onKeydown = (event: KeyboardEvent) => {
      altAlone = event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (event.key === 'F10' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        if (openMenu) close();
        else openWithKeyboard(MENUS[0]!.id);
      }
    };
    const onKeyup = (event: KeyboardEvent) => {
      if (event.key === 'Alt' && altAlone && !isMac) {
        event.preventDefault();
        if (openMenu) close();
        else openWithKeyboard(MENUS[0]!.id);
      }
      altAlone = false;
    };
    const reset = () => (altAlone = false);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);
    window.addEventListener('pointerdown', reset, true);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('keyup', onKeyup);
      window.removeEventListener('pointerdown', reset, true);
    };
  });

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
    const keys: Record<string, () => void> = {
      Escape: close,
      ArrowDown: () => moveFocus(1),
      ArrowUp: () => moveFocus(-1),
      Home: () => moveFocus(0, 'first'),
      End: () => moveFocus(0, 'last'),
      ArrowRight: () => switchMenu(1),
      ArrowLeft: () => switchMenu(-1),
      Tab: close,
    };
    const onKeydown = (event: KeyboardEvent) => {
      const action = keys[event.key];
      if (!action) return;
      // The editor must not move its cursor while the menu has the keyboard.
      event.preventDefault();
      event.stopPropagation();
      action();
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
