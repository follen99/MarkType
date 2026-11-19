<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import { relativePath, type FolderSearchResults, type FoldersApi } from '@marktype/platform';
  import type { Workspace } from '../workspace.svelte.ts';
  import { errorMessage } from '../document.svelte.ts';
  import type { SidebarState } from './sidebar.svelte.ts';

  let {
    folders,
    workspace,
    sidebar,
    t,
  }: { folders: FoldersApi | null; workspace: Workspace; sidebar: SidebarState; t: Translate } = $props();

  let query = $state('');
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let regex = $state(false);
  let results = $state<FolderSearchResults | null>(null);
  let error = $state<string | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let generation = 0;

  $effect(() => {
    void sidebar.focusSearch;
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  });

  // Search as you type (debounced); re-run when options or folder change.
  $effect(() => {
    const options = { query, caseSensitive, wholeWord, regex };
    const root = workspace.folder;
    if (!folders || !root || !query.trim()) {
      results = null;
      error = null;
      return;
    }
    const current = ++generation;
    const timer = setTimeout(async () => {
      try {
        const found = await folders.search(root, options);
        if (current === generation) {
          results = found;
          error = null;
        }
      } catch (e) {
        if (current === generation) {
          results = null;
          error = errorMessage(e);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  async function open(path: string, line: number) {
    const doc = await workspace.openPath(path);
    doc?.revealLine(line);
  }

  function parts(text: string, ranges: [number, number][]) {
    const out: { text: string; hit: boolean }[] = [];
    let index = 0;
    for (const [start, end] of ranges) {
      if (start > index) out.push({ text: text.slice(index, start), hit: false });
      out.push({ text: text.slice(start, end), hit: true });
      index = end;
    }
    if (index < text.length) out.push({ text: text.slice(index), hit: false });
    return out;
  }
</script>

<div class="mt-search">
  {#if !folders || !workspace.folder}
    <p class="mt-sidebar-empty">{t('search.needFolder')}</p>
  {:else}
    <div class="mt-search-box">
      <input
        class="mt-input"
        type="search"
        placeholder={t('search.placeholder')}
        spellcheck="false"
        bind:value={query}
        bind:this={input}
      />
      <div class="mt-toggle-group">
        <button
          class="mt-toggle"
          class:on={caseSensitive}
          title={t('search.caseSensitive')}
          onclick={() => (caseSensitive = !caseSensitive)}
        >
          Aa
        </button>
        <button
          class="mt-toggle"
          class:on={wholeWord}
          title={t('search.wholeWord')}
          onclick={() => (wholeWord = !wholeWord)}
        >
          <u>ab</u>
        </button>
        <button class="mt-toggle" class:on={regex} title={t('search.regex')} onclick={() => (regex = !regex)}>
          .*
        </button>
      </div>
    </div>
    {#if error}
      <p class="mt-sidebar-empty mt-error">{error}</p>
    {:else if results}
      <p class="mt-search-summary">
        {results.total
          ? t('search.results', { count: results.total, files: results.files.length })
          : t('search.none')}
        {#if results.truncated}<br />{t('search.truncated', { count: results.total })}{/if}
      </p>
      <ul class="mt-search-results">
        {#each results.files as file (file.path)}
          <li class="mt-search-file">
            <div class="mt-search-file-name" title={file.path}>
              {relativePath(file.path, workspace.folder)}
            </div>
            <ul>
              {#each file.matches as match, index (index)}
                <li>
                  <button class="mt-search-hit" onclick={() => open(file.path, match.line)}>
                    <span class="mt-search-line">{match.line}</span>
                    <span class="mt-search-text">
                      {#each parts(match.text, match.ranges) as part, i (i)}{#if part.hit}<mark>
                            {part.text}
                          </mark>{:else}{part.text}{/if}{/each}
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
