// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { URL } from 'node:url';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: cloudflare({
		imageService: 'passthrough',
		auxiliaryWorkers: [{ configPath: new URL('../../workers/do/wrangler.jsonc', import.meta.url).pathname }],
	}),
	session: false,
  integrations: [react(), mdx()],
  markdown: {
    // Warna kode datang dari variabel --astro-code-* di tokens.css, bukan hex di komponen.
    shikiConfig: { theme: 'css-variables' },
  },
  vite: { plugins: [tailwindcss()] },
});
