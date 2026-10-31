// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare(),
  integrations: [react(), mdx()],
  markdown: {
    // Warna kode datang dari variabel --astro-code-* di tokens.css, bukan hex di komponen.
    shikiConfig: { theme: 'css-variables' },
  },
  vite: { plugins: [tailwindcss()] },
});
