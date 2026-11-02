import { handle } from '@astrojs/cloudflare/handler';
import { replayReady } from './lib/server-emulator';

// Import endpoint Astro bersifat lazy; lakukan inisialisasi emulator saat startup Worker.
await replayReady;
export default { fetch: handle } satisfies ExportedHandler<Env>;
