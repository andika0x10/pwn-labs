import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
export const root = path.resolve(import.meta.dirname, '..');
export async function levelFiles() {
  const directory = path.join(root, 'apps/web/src/content/levels');
  const files = (await readdir(directory, { recursive: true })).filter((file) => file.endsWith('.mdx')).sort();
  return Promise.all(files.map(async (relative) => {
    const file = path.join(directory, relative);
    const text = await readFile(file, 'utf8');
    const header = text.match(/^---\n([\s\S]*?)\n---/);
    if (!header) throw new Error(relative + ': frontmatter tidak ditemukan');
    return { file, relative, text, data: parse(header[1]) };
  }));
}
