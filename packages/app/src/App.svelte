<script lang="ts">
  import type { Platform } from '@marktype/platform';
  import type { Translate } from '@marktype/i18n';
  import TitleBar from './chrome/TitleBar.svelte';
  import StatusBar from './chrome/StatusBar.svelte';

  let { platform, t }: { platform: Platform; t: Translate } = $props();

  const title = 'MarkType';
</script>

<div id="mt-root">
  <TitleBar {platform} {t} {title} />
  <main id="mt-main">
    <div id="write">
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.body')}</p>
    </div>
  </main>
  <StatusBar {platform} {t} />
</div>
