<script lang="ts">
  import type { Translate } from '@marktype/i18n';
  import type { Workspace } from '../workspace.svelte.ts';
  import Icon from '../ui/Icon.svelte';

  let { workspace, t }: { workspace: Workspace; t: Translate } = $props();

  function onAuxClick(event: MouseEvent, index: number) {
    if (event.button === 1) {
      event.preventDefault();
      void workspace.closeTab(workspace.docs[index]);
    }
  }
</script>

<div class="mt-tabs" role="tablist">
  {#each workspace.docs as doc, index (doc.id)}
    <div
      class="mt-tab"
      class:active={doc.id === workspace.activeId}
      class:dirty={doc.dirty}
      role="tab"
      tabindex="0"
      aria-selected={doc.id === workspace.activeId}
      title={doc.file?.id ?? doc.name}
      onclick={() => workspace.activate(doc)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && workspace.activate(doc)}
      onauxclick={(e) => onAuxClick(e, index)}
      onmousedown={(e) => e.button === 1 && e.preventDefault()}
    >
      <span class="mt-tab-name">{doc.name}</span>
      <button
        class="mt-tab-close"
        title={t('tabs.close')}
        aria-label={t('tabs.close')}
        onclick={(e) => {
          e.stopPropagation();
          void workspace.closeTab(doc);
        }}
      >
        <span class="mt-tab-dot" aria-hidden="true"></span>
        <Icon name="close" size={12} />
      </button>
    </div>
  {/each}
  <button
    class="mt-tab-new"
    title={t('tabs.new')}
    aria-label={t('tabs.new')}
    onclick={() => workspace.newTab()}
  >
    <Icon name="plus" size={14} />
  </button>
</div>
