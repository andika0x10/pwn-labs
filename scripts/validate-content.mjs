import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root, levelFiles } from './level-files.mjs';

const publicDir = path.join(root, 'apps/web/public');
const worldsDir = path.join(root, 'apps/web/src/content/worlds');
const worlds = new Map();
for (const file of (await readdir(worldsDir, { recursive: true })).filter((file) => file.endsWith('world.json'))) {
  const world = JSON.parse(await readFile(path.join(worldsDir, file), 'utf8'));
  if (worlds.has(world.id)) throw new Error(file + ': id world duplikat');
  worlds.set(world.id, world);
}
const levels = await levelFiles();
const manifest = JSON.parse(await readFile(path.join(root, 'challenges/manifest.json'), 'utf8'));
const ids = new Map();
const positions = new Set();
for (const { relative, data } of levels) {
  const check = (condition, message) => assert.ok(condition, relative + ': ' + message);
  check(!ids.has(data.id), 'id duplikat');
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.id), 'id tidak valid');
  ids.set(data.id, data);
  check(worlds.has(data.world), 'world tidak ditemukan');
  check(Number.isInteger(data.order) && data.order > 0, 'order harus positif');
  const position = data.world + ':' + data.order;
  check(!positions.has(position), 'order dalam world duplikat');
  positions.add(position);
  check(Number.isInteger(data.points) && data.points > 0, 'points harus positif');
  if (data.draft) continue;
  check(!worlds.get(data.world).draft, 'world masih draft');
  check(data.arch === 'x86-32', 'runtime challenge terbit hanya mendukung x86-32');
  check(data.binary?.startsWith('/binaries/'), 'binary harus berada di /binaries/');
  check(data.source?.startsWith('/sources/'), 'source harus berada di /sources/');
  const binary = path.join(publicDir, data.binary);
  check(existsSync(binary), 'binary tidak ditemukan');
  check(existsSync(path.join(publicDir, data.source)), 'source tidak ditemukan');
  const entry = manifest[data.id];
  check(entry, 'manifest tidak ditemukan; jalankan build:challenges');
  assert.deepEqual([...await readFile(binary)], entry.blob, relative + ': binary berbeda dari manifest');
  assert.equal(await readFile(path.join(publicDir, data.source), 'utf8'), entry.source, relative + ': source berbeda dari hasil build');
  assert.deepEqual(data.symbols, entry.symbols, relative + ': simbol berbeda dari hasil build');
  assert.deepEqual(data.success, entry.success, relative + ': kondisi sukses berbeda dari hasil build');
  check(data.symbols._start >= 0x08048000 && data.symbols._start < 0x08048000 + entry.blob.length, 'alamat _start di luar binary');
  if (data.success.type === 'eip-reaches') check(data.success.symbol in data.symbols, 'simbol kondisi sukses tidak ditemukan');
  else check(data.success.type === 'output-contains' && data.success.value?.length, 'kondisi sukses tidak valid');
}
function visit(id, pathIds = new Set()) {
  assert.ok(!pathIds.has(id), id + ': siklus requires');
  const data = ids.get(id);
  const next = new Set([...pathIds, id]);
  for (const requirement of data.requires ?? []) {
    assert.ok(ids.has(requirement), id + ': requires tidak ditemukan: ' + requirement);
    assert.ok(data.draft || !ids.get(requirement).draft, id + ': requires menunjuk draft');
    visit(requirement, next);
  }
}
for (const id of ids.keys()) visit(id);
for (const id of Object.keys(manifest)) assert.ok(ids.has(id) && !ids.get(id).draft, id + ': manifest usang; jalankan build:challenges');
console.log(levels.length + ' level valid: world, prasyarat, source, binary, simbol, dan manifest.');
