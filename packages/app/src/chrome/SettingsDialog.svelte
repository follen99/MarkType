<script lang="ts">
  import type { MessageKey, Translate } from '@marktype/i18n';
  import type { Platform } from '@marktype/platform';
  import type { Workspace } from '../workspace.svelte.ts';
  import type { ThemeManager } from '../theme.svelte.ts';
  import { DEFAULT_IMAGE_SETTINGS, type ImageDestination } from '../images.ts';
  import { FONT_SIZES, PAGE_WIDTHS, type AppSettings, type LanguageSetting } from '../settings.svelte.ts';

  let {
    open = $bindable(false),
    platform,
    workspace,
    settings,
    themes,
    t,
    onclose,
  }: {
    open: boolean;
    platform: Platform;
    workspace: Workspace;
    settings: AppSettings;
    themes: ThemeManager;
    t: Translate;
    onclose: () => void;
  } = $props();

  const DESTINATIONS: [ImageDestination, MessageKey][] = [
    ['assets', 'image.dest.assets'],
    ['filenameAssets', 'image.dest.filenameAssets'],
    ['custom', 'image.dest.custom'],
    ['none', 'image.dest.none'],
  ];

  let card = $state<HTMLElement | null>(null);
  let pandocStatus = $state<string | null>(null);
  let checking = $state(false);
  // svelte-ignore state_referenced_locally
  const initialLanguage = settings.language;

  $effect(() => {
    if (!open) return;
    pandocStatus = null;
    queueMicrotask(() => card?.querySelector<HTMLElement>('select, input, button')?.focus());
  });

  function close() {
    open = false;
    onclose();
  }

  function onKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  const sizeValue = (value: number | null) => (value === null ? '' : String(value));
  const parseSize = (value: string) => (value === '' ? null : Number(value));

  async function checkPandoc() {
    checking = true;
    const { pandocVersion } = await import('../export.ts');
    const version = await pandocVersion(platform, settings.exportSettings.pandocPath);
    pandocStatus = version ? t('settings.export.found', { version }) : t('settings.export.notFound');
    checking = false;
  }

  function onPatternChange(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    workspace.setImageSettings({ pattern: value || DEFAULT_IMAGE_SETTINGS.pattern });
  }
</script>

{#if open}
  <div class="mt-dialog-backdrop" role="presentation" onkeydown={onKeydown}>
    <div
      class="mt-dialog mt-settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mt-settings-title"
      bind:this={card}
    >
      <h2 id="mt-settings-title" class="mt-dialog-title">{t('settings.title')}</h2>
      <div class="mt-settings-body">
        <section>
          <h3>{t('settings.general')}</h3>
          <label class="mt-settings-row">
            <span>{t('settings.language')}</span>
            <select
              class="mt-input"
              value={settings.language}
              onchange={(e) => settings.setLanguage(e.currentTarget.value as LanguageSetting)}
            >
              <option value="auto">{t('settings.language.auto')}</option>
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </select>
          </label>
          {#if settings.language !== initialLanguage}
            <p class="mt-settings-note">{t('settings.language.restart')}</p>
          {/if}
          <label class="mt-settings-check">
            <input type="checkbox" checked={workspace.autosave} onchange={() => workspace.toggleAutosave()} />
            <span>{t('settings.autosave')}</span>
          </label>
          {#if platform.folders}
            <label class="mt-settings-check">
              <input
                type="checkbox"
                checked={settings.restoreFolder}
                onchange={(e) => settings.setRestoreFolder(e.currentTarget.checked)}
              />
              <span>{t('settings.restoreFolder')}</span>
            </label>
          {/if}
        </section>

        <section>
          <h3>{t('settings.editor')}</h3>
          <label class="mt-settings-row">
            <span>{t('settings.fontSize')}</span>
            <select
              class="mt-input"
              value={sizeValue(settings.fontSize)}
              onchange={(e) => settings.setLayout({ fontSize: parseSize(e.currentTarget.value) })}
            >
              {#each FONT_SIZES as size (size)}
                <option value={sizeValue(size)}>{size === null ? t('settings.theme') : `${size} px`}</option>
              {/each}
            </select>
          </label>
          <label class="mt-settings-row">
            <span>{t('settings.pageWidth')}</span>
            <select
              class="mt-input"
              value={sizeValue(settings.pageWidth)}
              onchange={(e) => settings.setLayout({ pageWidth: parseSize(e.currentTarget.value) })}
            >
              {#each PAGE_WIDTHS as width (width)}
                <option value={sizeValue(width)}>
                  {width === null
                    ? t('settings.theme')
                    : width === 0
                      ? t('settings.fullWidth')
                      : `${width} px`}
                </option>
              {/each}
            </select>
          </label>
        </section>

        {#if platform.images}
          <section>
            <h3>{t('settings.images')}</h3>
            <label class="mt-settings-row">
              <span>{t('settings.images.destination')}</span>
              <select
                class="mt-input"
                value={workspace.imageSettings.destination}
                onchange={(e) =>
                  workspace.setImageSettings({ destination: e.currentTarget.value as ImageDestination })}
              >
                {#each DESTINATIONS as [id, label] (id)}
                  <option value={id}>{t(label)}</option>
                {/each}
              </select>
            </label>
            {#if workspace.imageSettings.destination === 'custom'}
              <label class="mt-settings-row">
                <span>{t('settings.images.customFolder')}</span>
                <input
                  class="mt-input"
                  type="text"
                  spellcheck="false"
                  placeholder="./img"
                  value={workspace.imageSettings.customFolder}
                  onchange={(e) => workspace.setImageSettings({ customFolder: e.currentTarget.value.trim() })}
                />
              </label>
            {/if}
            <label class="mt-settings-row">
              <span>{t('settings.images.pattern')}</span>
              <input
                class="mt-input"
                type="text"
                spellcheck="false"
                value={workspace.imageSettings.pattern}
                onchange={onPatternChange}
              />
            </label>
            <p class="mt-settings-note">{t('settings.images.patternHelp')}</p>
            <label class="mt-settings-check">
              <input
                type="checkbox"
                checked={workspace.imageSettings.askName}
                onchange={(e) => workspace.setImageSettings({ askName: e.currentTarget.checked })}
              />
              <span>{t('image.askName')}</span>
            </label>
          </section>
        {/if}

        <section>
          <h3>{t('settings.export')}</h3>
          <label class="mt-settings-check">
            <input
              type="checkbox"
              checked={settings.exportSettings.embedImages}
              onchange={(e) => settings.setExport({ embedImages: e.currentTarget.checked })}
            />
            <span>{t('settings.export.embedImages')}</span>
          </label>
          {#if platform.export.pandoc}
            <label class="mt-settings-row">
              <span>{t('settings.export.pandocPath')}</span>
              <input
                class="mt-input"
                type="text"
                spellcheck="false"
                placeholder={t('settings.export.pandocPlaceholder')}
                value={settings.exportSettings.pandocPath}
                onchange={(e) => {
                  settings.setExport({ pandocPath: e.currentTarget.value.trim() });
                  pandocStatus = null;
                }}
              />
            </label>
            <div class="mt-settings-actions">
              <button class="mt-button" disabled={checking} onclick={checkPandoc}>
                {t('settings.export.check')}
              </button>
              <button
                class="mt-button"
                onclick={() => platform.openExternal('https://pandoc.org/installing.html')}
              >
                {t('settings.export.download')}
              </button>
              {#if pandocStatus}<span class="mt-settings-status">{pandocStatus}</span>{/if}
            </div>
          {/if}
        </section>

        {#if platform.config}
          {@const config = platform.config}
          <section>
            <h3>{t('settings.files')}</h3>
            <p class="mt-settings-note mt-settings-path">{config.settingsPath}</p>
            <div class="mt-settings-actions">
              <button class="mt-button" onclick={() => config.openFile('settings')}>
                {t('settings.files.settings')}
              </button>
              <button class="mt-button" onclick={() => config.openFile('keybindings')}>
                {t('settings.files.keybindings')}
              </button>
              {#if platform.themes}
                <button class="mt-button" onclick={() => themes.openFolder()}>
                  {t('settings.files.themes')}
                </button>
              {/if}
            </div>
            <p class="mt-settings-note">{t('settings.files.help')}</p>
          </section>
        {/if}
      </div>
      <div class="mt-dialog-buttons">
        <button class="mt-button primary" onclick={close}>{t('settings.close')}</button>
      </div>
    </div>
  </div>
{/if}
