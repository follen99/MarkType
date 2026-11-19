<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import type { FolderEntry } from '@marktype/platform';
  import type { FileTree } from '../filetree.svelte.ts';
  import type { ContextMenuState } from '../ui/contextmenu.svelte.ts';
  import type { FileActions } from './fileactions.ts';
  import Icon from '../ui/Icon.svelte';
  import TreeNode from './TreeNode.svelte';

  let {
    entry,
    depth,
    tree,
    actions,
    menu,
    t,
    activePath,
    openFile,
  }: {
    entry: FolderEntry;
    depth: number;
    tree: FileTree;
    actions: FileActions;
    menu: ContextMenuState;
    t: Translate;
    activePath: string | null;
    openFile: (path: string) => void;
  } = $props();

  let dropTarget = $state(false);

  const expanded = $derived(!!tree.expanded[entry.path]);
  const active = $derived(
    !entry.isDir && activePath !== null && activePath.toLowerCase() === entry.path.toLowerCase(),
  );
  const label = $derived(
    entry.isDir ? entry.name : entry.name.replace(/\.(md|markdown|mdown|mkdn?|mdx)$/i, ''),
  );

  function activate() {
    if (entry.isDir) void tree.toggle(entry.path);
    else openFile(entry.path);
  }

  function onContextMenu(event: MouseEvent) {
    const dir = entry.isDir ? entry.path : null;
    menu.show(event, [
      ...(dir
        ? [
            { label: t('files.newFile'), run: () => void actions.newFile(dir) },
            { label: t('files.newFolder'), run: () => void actions.newFolder(dir) },
            '-' as const,
          ]
        : []),
      { label: t('files.rename'), run: () => void actions.rename(entry) },
      { label: t('files.copyPath'), run: () => actions.copyPath(entry.path) },
      '-',
      { label: t('files.delete'), run: () => void actions.trash(entry), danger: true },
    ]);
  }

  function onDragStart(event: DragEvent) {
    event.dataTransfer?.setData('application/x-marktype-path', entry.path);
    event.dataTransfer!.effectAllowed = 'move';
  }

  function onDragOver(event: DragEvent) {
    if (!entry.isDir || !event.dataTransfer?.types.includes('application/x-marktype-path')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dropTarget = true;
  }

  function onDrop(event: DragEvent) {
    dropTarget = false;
    const path = event.dataTransfer?.getData('application/x-marktype-path');
    if (!entry.isDir || !path) return;
    event.preventDefault();
    event.stopPropagation();
    void actions.move(path, entry.path);
  }
</script>

<li
  class="file-tree-node"
  class:active
  class:expanded
  role="treeitem"
  aria-expanded={entry.isDir ? expanded : undefined}
  aria-selected={active}
>
  <div
    class="file-node-content"
    class:mt-drop-target={dropTarget}
    style:--mt-depth={depth}
    role="button"
    tabindex="-1"
    draggable="true"
    title={entry.path}
    onclick={activate}
    onkeydown={(e) => e.key === 'Enter' && activate()}
    oncontextmenu={onContextMenu}
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondragleave={() => (dropTarget = false)}
    ondrop={onDrop}
  >
    {#if entry.isDir}
      <span class="file-node-open-state" class:open={expanded}><Icon name="chevron" size={12} /></span>
      <span class="file-node-icon"><Icon name="folder" size={14} /></span>
    {:else}
      <span class="file-node-open-state"></span>
      <span class="file-node-icon"><Icon name="file" size={14} /></span>
    {/if}
    <span class="file-node-title">{label}</span>
  </div>
  {#if entry.isDir && expanded}
    <ul class="file-node-children" role="group">
      {#each tree.children[entry.path] ?? [] as child (child.path)}
        <TreeNode entry={child} depth={depth + 1} {tree} {actions} {menu} {t} {activePath} {openFile} />
      {/each}
    </ul>
  {/if}
</li>
