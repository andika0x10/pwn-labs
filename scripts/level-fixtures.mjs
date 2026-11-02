import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { root, levelFiles } from './level-files.mjs';

const parserSource = await readFile(path.join(root, 'apps/web/src/lib/payload/parser.ts'), 'utf8');
const { outputText } = ts.transpileModule(parserSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
export const { parsePayload } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
export function resolveExpression(expression, symbols) {
  return expression.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_match, name) => {
    if (!(name in symbols)) throw new Error('Simbol solution tidak ditemukan: ' + name);
    return String(symbols[name]);
  });
}
export async function fixtures() {
  const manifest = JSON.parse(await readFile(path.join(root, 'challenges/manifest.json'), 'utf8'));
  return Promise.all((await levelFiles()).filter(({ data }) => !data.draft).map(async ({ data }) => {
    const challenge = manifest[data.id];
    if (!challenge) throw new Error(data.id + ': manifest tidak ditemukan, jalankan build:challenges');
    const directory = path.join(root, 'challenges/src', data.id);
    const solution = resolveExpression(await readFile(path.join(directory, 'solution.payload'), 'utf8'), challenge.symbols);
    const negative = JSON.parse(await readFile(path.join(directory, 'negative.json'), 'utf8')).map((value) => resolveExpression(value, challenge.symbols));
    return { id: data.id, challenge: { ...challenge, success: data.success, symbols: data.symbols }, solution, negative };
  }));
}
export async function loadUnicorn() {
  const require = createRequire(import.meta.url);
  const MUnicorn = require('../spike/wasm/unicorn_x86.glue.cjs');
  const wasmModule = await WebAssembly.compile(await readFile(path.join(root, 'spike/wasm/unicorn_x86.wasm')));
  const trampolines = {};
  for (const signature of ['vii', 'viii', 'vijii', 'viijiji', 'iiijiji']) {
    trampolines[signature] = new WebAssembly.Module(await readFile(path.join(root, 'spike/wasm/tramp_' + signature + '.wasm')));
  }
  return MUnicorn({
    trampolines,
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasmModule, imports).then((instance) => done(instance, wasmModule));
      return {};
    },
  });
}
