import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(import.meta.dirname, '..');
const levelsDir = path.join(root, 'apps/web/src/content/levels');
const publicDir = path.join(root, 'apps/web/public');
const files = (await readdir(levelsDir, { recursive: true })).filter((file) => file.endsWith('.mdx'));
const levels = [];
const errors = [];

for (const relative of files) {
  const file = path.join(levelsDir, relative);
  const text = await readFile(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { errors.push(`${relative}: frontmatter tidak ditemukan`); continue; }
  try {
    const data = parse(match[1]);
    levels.push({ relative, data });
  } catch (error) {
    errors.push(`${relative}: frontmatter: ${error.message}`);
  }
}

const ids = new Set();
for (const { relative, data } of levels) {
  if (ids.has(data.id)) errors.push(`${relative}: id: ${data.id} duplikat`);
  ids.add(data.id);
  if (!Number.isInteger(data.points) || data.points <= 0) errors.push(`${relative}: points: harus integer positif`);
  const binary = path.join(publicDir, String(data.binary ?? '').replace(/^\//, ''));
  if (!existsSync(binary)) errors.push(`${relative}: binary: ${data.binary} tidak ditemukan`);
}
for (const { relative, data } of levels) {
  for (const requirement of data.requires ?? []) {
    if (!ids.has(requirement)) errors.push(`${relative}: requires: ${requirement} tidak ditemukan`);
    if (requirement === data.id) errors.push(`${relative}: requires: level tidak boleh mensyaratkan dirinya sendiri`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${levels.length} level valid.`);
