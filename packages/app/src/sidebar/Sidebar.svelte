<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import type { FoldersApi } from '@marktype/platform';
  import type { FileTree } from '../filetree.svelte.ts';
  import type { Workspace } from '../workspace.svelte.ts';
  import type { ContextMenuState } from '../ui/contextmenu.svelte.ts';
  import type { FileActions } from './fileactions.ts';
  import type { SidebarState, SidebarTab } from './sidebar.svelte.ts';
  import FilesPanel from './FilesPanel.svelte';
  import OutlinePanel from './OutlinePanel.svelte';
  import SearchPanel from './SearchPanel.svelte';

  let {
    sidebar,
    workspace,
    tree,
    actions,
    folders,
    menu,
    t,
    pickFolder,
  }: {
    sidebar: SidebarState;
    workspace: Workspace;
    tree: FileTree | null;
    actions: FileActions | null;
    folders: FoldersApi | null;
    menu: ContextMenuState;
    t: Translate;
    pickFolder: () => void;
  } = $props();

  const tabs: { id: SidebarTab; label: 'sidebar.files' | 'sidebar.outline' | 'sidebar.search' }[] = [
    { id: 'files', label: 'sidebar.files' },
    { id: 'outline', label: 'sidebar.outline' },
    { id: 'search', label: 'sidebar.search' },
  ];

  function startResize(event: PointerEvent) {
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebar.width;
    const move = (e: PointerEvent) => sidebar.resize(startWidth + e.clientX - startX);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      sidebar.commitWidth();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }
</script>

<aside id="typora-sidebar" class="mt-sidebar" style:width="{sidebar.width}px">
  <div class="sidebar-tabs" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        class="sidebar-tab"
        class:active={sidebar.tab === tab.id}
        role="tab"
        aria-selected={sidebar.tab === tab.id}
        onclick={() => {
          sidebar.tab = tab.id;
          if (tab.id === 'search') sidebar.focusSearch++;
        }}
      >
        {t(tab.label)}
      </button>
    {/each}
  </div>
  <div class="sidebar-content">
    {#if sidebar.tab === 'files'}
      <FilesPanel {tree} {actions} {workspace} {menu} {t} {pickFolder} />
    {:else if sidebar.tab === 'outline'}
      <OutlinePanel doc={workspace.active} {t} />
    {:else}
      <SearchPanel {folders} {workspace} {sidebar} {t} />
    {/if}
  </div>
  <div
    class="mt-sidebar-resizer"
    role="separator"
    aria-orientation="vertical"
    aria-label={t('sidebar.resize')}
    onpointerdown={startResize}
  ></div>
</aside>
