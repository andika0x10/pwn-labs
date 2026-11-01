import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const binaryDir = path.join(root, 'apps/web/public/binaries');
const sourceDir = path.join(root, 'apps/web/public/sources');
await mkdir(binaryDir, { recursive: true });
await mkdir(sourceDir, { recursive: true });

function buildBlob() {
  const base = 0x08048000;
  const code = [];
  const emit = (...bytes) => code.push(...bytes);
  const imm32 = (value) => [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255];
  emit(0xe8, 0, 0, 0, 0);
  emit(0xb8, ...imm32(1), 0xbb, ...imm32(1), 0xcd, 0x80);
  const vuln = code.length;
  code.splice(1, 4, ...imm32(vuln - 5));
  emit(0x55, 0x89, 0xe5, 0x83, 0xec, 0x40);
  emit(0xb8, ...imm32(3), 0xbb, ...imm32(0));
  emit(0x8d, 0x4d, 0xc0, 0xba, ...imm32(0x100), 0xcd, 0x80, 0xc9, 0xc3);
  const win = code.length;
  const message = win + 29;
  emit(0xb8, ...imm32(4), 0xbb, ...imm32(1));
  emit(0xb9, ...imm32(base + message), 0xba, ...imm32(4), 0xcd, 0x80);
  emit(0xb8, ...imm32(1), 0xbb, ...imm32(0), 0xcd, 0x80);
  emit(...new TextEncoder().encode('WIN\n'));
  return Uint8Array.from(code);
}

const source = `/* Fixture edukasi freestanding. Runtime menyediakan read/write/exit melalui int 0x80. */
void win(void) { /* menulis WIN\\n lalu keluar */ }
void vuln(void) { char buffer[64]; /* read(0, buffer, 256) sengaja overflow */ }
void _start(void) { vuln(); }
`;

for (const id of ['example-01', 'example-02']) {
  await writeFile(path.join(binaryDir, `${id}.bin`), buildBlob());
  await writeFile(path.join(sourceDir, `${id}.c`), source);
}
console.log('Dua binary fixture dan source view berhasil dibuat.');
