<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import { basename, dirname, relativePath, type FoldersApi } from '@marktype/platform';
  import type { Workspace } from '../workspace.svelte.ts';
  import { fuzzyFilter } from '../fuzzy.ts';

  let {
    open = $bindable(),
    workspace,
    folders,
    t,
  }: { open: boolean; workspace: Workspace; folders: FoldersApi | null; t: Translate } = $props();

  let query = $state('');
  let files = $state<string[]>([]);
  let selected = $state(0);
  let input = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLElement | null>(null);

  // Load the folder's files each time the palette opens (cheap, and always fresh).
  $effect(() => {
    if (!open) return;
    query = '';
    selected = 0;
    queueMicrotask(() => input?.focus());
    const root = workspace.folder;
    const tabs = workspace.docs.flatMap((d) => (d.file ? [d.file.id] : []));
    files = [...new Set([...tabs, ...workspace.recentFiles])];
    if (folders && root) {
      void folders.markdownFiles(root).then((found) => {
        files = [...new Set([...tabs, ...found, ...workspace.recentFiles])];
      });
    }
  });

  const display = (path: string) => (workspace.folder ? relativePath(path, workspace.folder) : path);
  const results = $derived(
    query.trim()
      ? fuzzyFilter(query, files, display, 60)
      : files.slice(0, 60).map((item) => ({ item, match: { score: 0, positions: [] as number[] } })),
  );

  $effect(() => {
    void results;
    if (selected >= results.length) selected = Math.max(0, results.length - 1);
  });

  $effect(() => {
    (list?.children[selected] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  });

  function choose(path: string | undefined) {
    if (!path) return;
    open = false;
    void workspace.openPath(path);
  }

  function onKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      open = false;
      workspace.active?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      selected = Math.min(results.length - 1, selected + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selected = Math.max(0, selected - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[selected]?.item);
    }
  }

  function highlight(text: string, positions: number[]) {
    const set = new Set(positions);
    return [...text].map((char, i) => ({ char, hit: set.has(i) }));
  }
</script>

{#if open}
  <div
    class="mt-palette-backdrop"
    role="presentation"
    onpointerdown={(e) => e.target === e.currentTarget && (open = false)}
  >
    <div class="mt-palette" role="dialog" aria-modal="true" aria-label={t('cmd.quickOpen')}>
      <input
        class="mt-input mt-palette-input"
        type="text"
        placeholder={t('quickOpen.placeholder')}
        spellcheck="false"
        bind:value={query}
        bind:this={input}
        onkeydown={onKeydown}
      />
      <ul class="mt-palette-list" role="listbox" bind:this={list}>
        {#each results as { item, match }, index (item)}
          {@const shown = display(item)}
          {@const nameStart = shown.length - basename(shown).length}
          <li role="option" aria-selected={index === selected}>
            <button
              class="mt-palette-item typora-quick-open-item"
              class:active={index === selected}
              onpointermove={() => (selected = index)}
              onclick={() => choose(item)}
            >
              <span class="mt-palette-name">
                {#each highlight( basename(shown), match.positions
                    .filter((p) => p >= nameStart)
                    .map((p) => p - nameStart) ) as c, i (i)}{#if c.hit}<b>
                      {c.char}
                    </b>{:else}{c.char}{/if}{/each}
              </span>
              <span class="mt-palette-path">{dirname(shown) === shown ? '' : dirname(shown)}</span>
              {#if workspace.find(item)}<span class="mt-palette-badge">{t('quickOpen.openTabs')}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="mt-palette-empty">{t('quickOpen.empty')}</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
