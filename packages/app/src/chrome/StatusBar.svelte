<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import type { DocumentController } from '../document.svelte.ts';

  let { doc, t }: { doc: DocumentController; t: Translate } = $props();

  const fmt = new Intl.NumberFormat();
</script>

<footer id="mt-statusbar">
  <span class="mt-status-mode">{t(`status.mode.${doc.mode}`)}</span>
  {#if doc.dirty}<span class="mt-status-dirty">● {t('status.unsaved')}</span>{/if}
  <span class="mt-status-spacer"></span>
  {#if doc.status}
    {#if doc.status.cursor}
      <span>{t('status.cursor', doc.status.cursor)}</span>
    {/if}
    <span>{t('status.words', { count: fmt.format(doc.status.words) })}</span>
    <span>{t('status.characters', { count: fmt.format(doc.status.characters) })}</span>
    <span>{t('status.lines', { count: fmt.format(doc.status.lines) })}</span>
    {#if doc.status.readingMinutes}
      <span>{t('status.reading', { minutes: doc.status.readingMinutes })}</span>
    {/if}
  {/if}
</footer>
