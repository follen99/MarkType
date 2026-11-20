<script lang="ts">
  import type { Dialogs } from '../dialogs.svelte.ts';

  let { dialogs }: { dialogs: Dialogs } = $props();

  let value = $state('');
  let checked = $state(false);
  let card = $state<HTMLElement | null>(null);

  $effect(() => {
    const request = dialogs.current;
    if (!request) return;
    if (request.kind === 'prompt') value = request.value;
    checked = false;
    // Focus the input or the primary button once rendered.
    queueMicrotask(() => {
      const target = card?.querySelector<HTMLElement>('input.mt-input, .mt-button.primary');
      target?.focus();
      if (target instanceof HTMLInputElement) target.select();
    });
  });

  function onKeydown(event: KeyboardEvent) {
    const request = dialogs.current;
    if (!request) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (request.kind === 'prompt') request.resolve(null);
      else
        request.resolve({
          id: (request.buttons.find((b) => b.cancel) ?? request.buttons.at(-1))!.id,
          checked,
        });
    } else if (event.key === 'Enter' && request.kind === 'prompt') {
      event.preventDefault();
      request.resolve(value);
    }
  }
</script>

{#if dialogs.current}
  {@const request = dialogs.current}
  <div class="mt-dialog-backdrop" role="presentation" onkeydown={onKeydown}>
    <div class="mt-dialog" role="dialog" aria-modal="true" aria-labelledby="mt-dialog-title" bind:this={card}>
      <h2 id="mt-dialog-title" class="mt-dialog-title">{request.title}</h2>
      {#if request.kind === 'confirm'}
        <p class="mt-dialog-message">{request.message}</p>
        {#if request.checkbox}
          <label class="mt-dialog-check">
            <input type="checkbox" bind:checked />
            <span>{request.checkbox}</span>
          </label>
        {/if}
        <div class="mt-dialog-buttons">
          {#each request.buttons as button (button.id)}
            <button
              class="mt-button"
              class:primary={button.primary}
              class:danger={button.danger}
              onclick={() => request.resolve({ id: button.id, checked })}
            >
              {button.label}
            </button>
          {/each}
        </div>
      {:else}
        <label class="mt-dialog-label">
          <span>{request.label}</span>
          <input class="mt-input" type="text" bind:value spellcheck="false" />
        </label>
        <div class="mt-dialog-buttons">
          <button class="mt-button" onclick={() => request.resolve(null)}>{request.cancelLabel}</button>
          <button class="mt-button primary" onclick={() => request.resolve(value)}>{request.okLabel}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
