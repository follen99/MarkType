import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages serves the site from /<repo>/; override with MARKTYPE_BASE for other hosts.
export default defineConfig({
  base: process.env.MARKTYPE_BASE ?? '/MarkType/',
  plugins: [svelte()],
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
});
