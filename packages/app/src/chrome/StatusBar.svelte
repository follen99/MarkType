<script lang="ts">
  import type { Platform } from '@marktype/platform';
  import type { Translate } from '@marktype/i18n';

  let { platform, t }: { platform: Platform; t: Translate } = $props();
</script>

<footer id="mt-statusbar">
  <span>{t('status.version', { version: platform.appVersion })}</span>
</footer>
