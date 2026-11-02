import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { stringify } from 'yaml';
import { root, levelFiles } from './level-files.mjs';

const levels = (await levelFiles()).filter(({ data }) => !data.draft);
for (const command of ['gcc', 'ld', 'objcopy', 'nm']) {
  try { execFileSync(command, ['--version'], { stdio: 'ignore' }); }
  catch { throw new Error('Toolchain belum tersedia: ' + command + '. Pasang GCC dan GNU binutils.'); }
}
const temporary = await mkdtemp(path.join(tmpdir(), 'pwn-challenges-'));
const manifest = {};
try {
  for (const { file, text, data } of levels) {
    if (data.arch !== 'x86-32') throw new Error(data.id + ': build hanya mendukung x86-32');
    const directory = path.join(root, 'challenges/src', data.id);
    const object = path.join(temporary, data.id + '.o');
    const elf = path.join(temporary, data.id + '.elf');
    execFileSync('gcc', ['-m32', '-c', '-nostdlib', '-o', object, path.join(directory, 'challenge.S')]);
    execFileSync('ld', ['-m', 'elf_i386', '-T', path.join(root, 'challenges/link.ld'), '-o', elf, object]);
    const binaryPath = path.join(root, 'apps/web/public', data.binary);
    await mkdir(path.dirname(binaryPath), { recursive: true });
    execFileSync('objcopy', ['-O', 'binary', '-j', '.text', elf, binaryPath]);
    const symbols = {};
    for (const line of execFileSync('nm', ['--defined-only', elf], { encoding: 'utf8' }).trim().split('\n')) {
      const match = line.match(/^([0-9a-f]+)\s+[Tt]\s+(.+)$/);
      if (match) symbols[match[2]] = Number.parseInt(match[1], 16);
    }
    const blob = [...await readFile(binaryPath)];
    if (!blob.length || blob.length > 4096) throw new Error(data.id + ': blob harus 1–4096 byte');
    const source = await readFile(path.join(directory, 'challenge.c'), 'utf8');
    for (const [suffix, content] of [['c', source], ['S', await readFile(path.join(directory, 'challenge.S'), 'utf8')]]) {
      const target = path.join(root, 'apps/web/public/sources', data.id + '.' + suffix);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    data.symbols = symbols;
    await writeFile(file, text.replace(/^---\n[\s\S]*?\n---/, '---\n' + stringify(data).trimEnd() + '\n---'));
    manifest[data.id] = { blob, symbols, source, binary: data.binary, arch: data.arch, success: data.success };
  }
  await writeFile(path.join(root, 'challenges/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log(levels.length + ' challenge dibangun dari assembly GNU; simbol dan manifest diperbarui.');
