<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import { MENUS, commandLabel, type CommandId } from '../commands/registry.ts';
  import { formatShortcut } from '../commands/keys.ts';

  let {
    t,
    isMac,
    shortcutOf,
    isChecked,
    run,
  }: {
    t: Translate;
    isMac: boolean;
    shortcutOf: (id: CommandId) => string | undefined;
    isChecked: (id: CommandId) => boolean | undefined;
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
          {#each menu.items as item, index (index)}
            {#if item === '-'}
              <div class="mt-menu-separator" role="separator"></div>
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
                  {#if checked !== undefined}<span class="mt-menu-check" aria-hidden="true">
                      {checked ? '✓' : ''}
                    </span>{/if}
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
