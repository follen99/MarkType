<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import { basename, dirname } from '@marktype/platform';
  import type { FileTree } from '../filetree.svelte.ts';
  import type { Workspace } from '../workspace.svelte.ts';
  import type { ContextMenuState } from '../ui/contextmenu.svelte.ts';
  import type { FileActions } from './fileactions.ts';
  import Icon from '../ui/Icon.svelte';
  import TreeNode from './TreeNode.svelte';

  let {
    tree,
    actions,
    workspace,
    menu,
    t,
    pickFolder,
  }: {
    tree: FileTree | null;
    actions: FileActions | null;
    workspace: Workspace;
    menu: ContextMenuState;
    t: Translate;
    pickFolder: () => void;
  } = $props();

  const activePath = $derived(workspace.active?.file?.id ?? null);
  let rootDrop = $state(false);

  function openFile(path: string) {
    void workspace.openPath(path);
  }

  function collapseAll() {
    if (!tree?.root) return;
    tree.expanded = { [tree.root]: true };
  }

  function onRootDrop(event: DragEvent) {
    rootDrop = false;
    const path = event.dataTransfer?.getData('application/x-marktype-path');
    if (!path || !tree?.root || !actions) return;
    event.preventDefault();
    void actions.move(path, tree.root);
  }
</script>

{#if tree?.root && actions}
  {@const root = tree.root}
  <div class="mt-files" id="file-library-tree">
    <div
      class="mt-files-header"
      class:mt-drop-target={rootDrop}
      role="group"
      title={root}
      oncontextmenu={(e) =>
        menu.show(e, [
          { label: t('files.newFile'), run: () => void actions.newFile(root) },
          { label: t('files.newFolder'), run: () => void actions.newFolder(root) },
          '-',
          { label: t('files.copyPath'), run: () => actions.copyPath(root) },
          { label: t('sidebar.closeFolder'), run: () => workspace.closeFolder() },
        ])}
      ondragover={(e) => {
        if (e.dataTransfer?.types.includes('application/x-marktype-path')) {
          e.preventDefault();
          rootDrop = true;
        }
      }}
      ondragleave={() => (rootDrop = false)}
      ondrop={onRootDrop}
    >
      <span class="mt-files-title">{basename(root) || root}</span>
      <div class="mt-icon-buttons">
        <button class="mt-icon-button" title={t('files.newFile')} onclick={() => actions.newFile(root)}>
          <Icon name="filePlus" />
        </button>
        <button class="mt-icon-button" title={t('files.newFolder')} onclick={() => actions.newFolder(root)}>
          <Icon name="folderPlus" />
        </button>
        <button class="mt-icon-button" title={t('sidebar.refresh')} onclick={() => tree.refresh()}>
          <Icon name="refresh" />
        </button>
        <button class="mt-icon-button" title={t('sidebar.collapse')} onclick={collapseAll}>
          <Icon name="collapse" />
        </button>
      </div>
    </div>
    {#if tree.error}
      <p class="mt-sidebar-empty">{tree.error}</p>
    {:else}
      <ul class="file-tree" role="tree">
        {#each tree.children[root] ?? [] as entry (entry.path)}
          <TreeNode {entry} depth={0} {tree} {actions} {menu} {t} {activePath} {openFile} />
        {/each}
      </ul>
    {/if}
  </div>
{:else}
  <div class="mt-files-empty">
    <p class="mt-sidebar-empty">{t('sidebar.noFolder')}</p>
    {#if tree}
      <button class="mt-button primary" onclick={pickFolder}>{t('sidebar.openFolder')}</button>
    {/if}
    {#if workspace.recentFiles.length}
      <h3 class="mt-sidebar-heading">{t('sidebar.recent')}</h3>
      <ul class="file-list">
        {#each workspace.recentFiles as path (path)}
          <li class="file-list-item" class:active={activePath === path}>
            <button class="file-list-item-button" title={path} onclick={() => openFile(path)}>
              <span class="file-list-item-file-name">{basename(path)}</span>
              <span class="file-list-item-parent-loc">{dirname(path)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
