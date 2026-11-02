import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const kind = process.argv[2];
const args = process.argv.slice(3);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function nextOrder(directory, suffix) {
  if (!existsSync(directory)) return 1;
  const files = await readdir(directory, { recursive: true });
  return files.filter((file) => file.endsWith(suffix)).length + 1;
}

async function replaceTree(directory, replacements) {
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    let value = await readFile(file, 'utf8');
    for (const [from, to] of replacements) value = value.replaceAll(from, String(to));
    await writeFile(file, value);
  }
}

if (kind === 'world') {
  const [slug] = args;
  if (!slugPattern.test(slug ?? '')) fail('Gunakan: npm run new:world -- <slug-kebab-case>');
  const target = path.join(root, 'apps/web/src/content/worlds', slug);
  if (existsSync(target)) fail(`World ${slug} sudah ada.`);
  const order = await nextOrder(path.dirname(target), 'world.json');
  await mkdir(target, { recursive: true });
  await cp(path.join(root, 'templates/world'), target, { recursive: true });
  await replaceTree(target, [['__WORLD__', slug], ['__ORDER__', order]]);
  console.log(`World draft dibuat di ${path.relative(root, target)}.`);
} else if (kind === 'level') {
  const [world, slug] = args;
  if (!slugPattern.test(world ?? '') || !slugPattern.test(slug ?? '')) {
    fail('Gunakan: npm run new:level -- <world> <slug-kebab-case>');
  }
  const worldFile = path.join(root, 'apps/web/src/content/worlds', world, 'world.json');
  if (!existsSync(worldFile)) fail(`World ${world} tidak ditemukan. Buat world terlebih dahulu.`);
  const id = `${world}-${slug}`;
  const contentDir = path.join(root, 'apps/web/src/content/levels', world);
  const target = path.join(contentDir, `${id}.mdx`);
  if (existsSync(target)) fail(`Level ${id} sudah ada.`);
  const order = await nextOrder(contentDir, '.mdx');
  await mkdir(contentDir, { recursive: true });
  const template = await readFile(path.join(root, 'templates/level/level.mdx'), 'utf8');
  await writeFile(target, template.replaceAll('__LEVEL__', id).replaceAll('__WORLD__', world).replaceAll('__ORDER__', String(order)));
  const sourceDir = path.join(root, 'challenges/src', id);
  await mkdir(sourceDir, { recursive: true });
  for (const name of ['challenge.c', 'challenge.S', 'solution.payload', 'negative.json']) {
    const value = (await readFile(path.join(root, 'templates/level', name), 'utf8')).replaceAll('__LEVEL__', id).replaceAll('__WORLD__', world);
    await writeFile(path.join(sourceDir, name), value);
  }
  console.log(`Level draft dibuat: ${path.relative(root, target)} dan ${path.relative(root, sourceDir)}.`);
} else {
  fail('Jenis scaffold harus world atau level.');
}
