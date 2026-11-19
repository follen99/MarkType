<script lang="ts" module>
  import type { FindAction } from '@marktype/editor';

  export interface FindBarApi {
    open(withReplace: boolean): void;
    run(action: FindAction): void;
  }
</script>

<script lang="ts">
  import type { FindResult } from '@marktype/editor';
  import type { Translate } from '@marktype/i18n';
  import type { DocumentController } from '../document.svelte.ts';
  import Icon from '../ui/Icon.svelte';

  let {
    doc,
    t,
    api = $bindable(),
  }: { doc: DocumentController | undefined; t: Translate; api?: FindBarApi } = $props();

  let visible = $state(false);
  let showReplace = $state(false);
  let text = $state('');
  let replace = $state('');
  let caseSensitive = $state(false);
  let wholeWord = $state(false);
  let regex = $state(false);
  let result = $state<FindResult | null>(null);
  let input = $state<HTMLInputElement | null>(null);

  const query = $derived({ text, replace, caseSensitive, wholeWord, regex });

  api = {
    open(withReplace) {
      if (withReplace) showReplace = true;
      const selection = window.getSelection()?.toString() ?? '';
      if (selection && !selection.includes('\n') && selection.length < 200) text = selection;
      visible = true;
      queueMicrotask(() => {
        input?.focus();
        input?.select();
      });
    },
    run(action) {
      if (!visible || !text) return this.open(false);
      result = doc?.find(action) ?? null;
    },
  };

  // Incremental search on every change of the query or of the active document.
  $effect(() => {
    if (!visible || !doc) return;
    result = doc.setFind(query.text ? query : null, true);
  });

  function close() {
    visible = false;
    doc?.setFind(null, false);
    result = null;
    doc?.focus();
  }

  function onKeydown(event: KeyboardEvent, inReplace: boolean) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (inReplace) result = doc?.find(event.ctrlKey || event.metaKey ? 'replaceAll' : 'replace') ?? null;
      else result = doc?.find(event.shiftKey ? 'prev' : 'next') ?? null;
    }
  }

  const summary = $derived.by(() => {
    if (!text || !result) return '';
    if (!result.valid) return t('find.invalid');
    if (!result.count) return t('find.none');
    return t('find.count', { current: result.current || '?', count: result.count });
  });
</script>

{#if visible}
  <div class="mt-findbar" role="search">
    <button
      class="mt-icon-button"
      title={t('find.toggleReplace')}
      aria-expanded={showReplace}
      onclick={() => (showReplace = !showReplace)}
    >
      <span class="mt-findbar-chevron" class:open={showReplace}><Icon name="chevron" size={12} /></span>
    </button>
    <div class="mt-findbar-rows">
      <div class="mt-findbar-row">
        <input
          class="mt-input"
          type="text"
          placeholder={t('find.placeholder')}
          spellcheck="false"
          bind:value={text}
          bind:this={input}
          onkeydown={(e) => onKeydown(e, false)}
        />
        <span class="mt-findbar-count" class:mt-error={result && !result.valid}>{summary}</span>
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
          <button
            class="mt-toggle"
            class:on={regex}
            title={t('search.regex')}
            onclick={() => (regex = !regex)}
          >
            .*
          </button>
        </div>
        <button
          class="mt-icon-button"
          title={t('find.prev')}
          onclick={() => (result = doc?.find('prev') ?? null)}
        >
          <Icon name="arrowUp" />
        </button>
        <button
          class="mt-icon-button"
          title={t('find.next')}
          onclick={() => (result = doc?.find('next') ?? null)}
        >
          <Icon name="arrowDown" />
        </button>
        <button class="mt-icon-button" title={t('find.close')} onclick={close}><Icon name="close" /></button>
      </div>
      {#if showReplace}
        <div class="mt-findbar-row">
          <input
            class="mt-input"
            type="text"
            placeholder={t('find.replacePlaceholder')}
            spellcheck="false"
            bind:value={replace}
            onkeydown={(e) => onKeydown(e, true)}
          />
          <button class="mt-button mt-button-small" onclick={() => (result = doc?.find('replace') ?? null)}>
            {t('find.replaceOne')}
          </button>
          <button
            class="mt-button mt-button-small"
            onclick={() => (result = doc?.find('replaceAll') ?? null)}
          >
            {t('find.replaceAll')}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
