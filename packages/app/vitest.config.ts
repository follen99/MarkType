import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The Svelte plugin compiles runes ($state, $derived) in *.svelte.ts modules under test.
export default defineConfig({
  plugins: [svelte()],
});
