<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import type { DocumentController } from '../document.svelte.ts';

  let { doc, t }: { doc: DocumentController | undefined; t: Translate } = $props();

  let list = $state<HTMLElement | null>(null);

  // Keep the active heading visible while scrolling the document.
  $effect(() => {
    const index = doc?.activeHeading ?? -1;
    if (index < 0 || !list) return;
    const item = list.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  });

  // Indent relative to the smallest level used, so a document starting at H2 is not indented.
  const minLevel = $derived(Math.min(6, ...(doc?.outline.map((h) => h.level) ?? [1])));
</script>

<div id="outline-content" class="mt-outline">
  {#if doc && doc.outline.length}
    <ul class="outline-content" bind:this={list}>
      {#each doc.outline as heading, index (index)}
        <li
          class="outline-item outline-h{heading.level}"
          class:outline-item-active={index === doc.activeHeading}
          style:--mt-outline-depth={heading.level - minLevel}
        >
          <button class="outline-label" title={heading.text} onclick={() => doc.revealHeading(index)}>
            {heading.text || '—'}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="mt-sidebar-empty">{t('sidebar.noHeadings')}</p>
  {/if}
</div>
