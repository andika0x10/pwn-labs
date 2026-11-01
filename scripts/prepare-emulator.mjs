import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'apps/web/public/emulator');
await mkdir(output, { recursive: true });
for (const name of ['unicorn_x86.wasm', 'unicorn_x86.glue.cjs', 'tramp_vii.wasm', 'tramp_viii.wasm', 'tramp_vijii.wasm', 'tramp_viijiji.wasm', 'tramp_iiijiji.wasm']) {
  await copyFile(path.join(root, 'spike/wasm', name), path.join(output, name));
}
await copyFile(path.join(root, 'spike/core.mjs'), path.join(output, 'core.mjs'));
const generated = path.join(root, 'apps/web/src/generated');
await mkdir(generated, { recursive: true });
const glue = await readFile(path.join(root, 'spike/wasm/unicorn_x86.glue.cjs'), 'utf8');
const commonJsFooter = glue.indexOf(';if(typeof exports==="object"');
if (commonJsFooter < 0) throw new Error('Footer CommonJS glue Unicorn berubah; perbarui skrip ekstraksi.');
await writeFile(path.join(generated, 'unicorn_x86.glue.mjs'), `${glue.slice(0, commonJsFooter)}\nexport default MUnicorn;\n`);
console.log('Asset Unicorn browser disiapkan dari spike tervalidasi.');
