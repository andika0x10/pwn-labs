import assert from 'node:assert/strict';
import { createRunner } from '../packages/emulator-core/core.mjs';
import { fixtures, loadUnicorn, parsePayload } from './level-fixtures.mjs';

const uc = await loadUnicorn();
const levels = await fixtures();
let oldPayloadSolves = 0;
for (const { id, challenge, solution, negative } of levels) {
  const reusable = createRunner(uc, challenge);
  const correct = parsePayload(solution);
  try {
    assert.equal(reusable.initial().registers.eip, challenge.symbols._start);
    const result = reusable.run(correct);
    assert.equal(result.reachedWin, true, id + ': solution gagal');
    assert.ok(result.stack.length, id + ': snapshot stack kosong');
    assert.equal(result.stack[0].bytes, [...correct.slice(0, 4)].map((byte) => byte.toString(16).padStart(2, '0')).join(' '));
    for (const expression of ['b""', '"A" * 8', ...negative]) {
      assert.equal(reusable.run(parsePayload(expression)).reachedWin, false, id + ': payload salah diterima: ' + expression);
      assert.deepEqual(reusable.run(correct), result, id + ': state berubah setelah payload salah');
    }
    const fresh = createRunner(uc, challenge);
    try { assert.deepEqual(fresh.run(correct), result, id + ': fresh/reusable berbeda'); }
    finally { fresh.close(); }
    assert.equal(reusable.run(correct, { includeMemory: false }).reachedWin, true);
    oldPayloadSolves += Number(reusable.run(parsePayload('"A" * 68 + p32(0x0804802d)')).reachedWin);
    console.log(id + ': solution, kasus negatif, snapshot, dan reset lolos.');
  } finally { reusable.close(); }
}
assert.ok(oldPayloadSolves < levels.length, 'Payload contoh lama menyelesaikan semua level');
assert.ok(levels.length >= 5, 'Lima soal Stack harus tersedia');
// Syscall read dengan frame yang tidak lazim tidak boleh membuat snapshot tak terbatas.
for (const buffer of [0x08048300, 0xbfffec00]) {
  const imm = (value) => [...new Uint8Array(new Uint32Array([value]).buffer)];
  const blob = [
    0xbd, ...imm(0xffffffff), // mov ebp, -1
    0xb8, ...imm(3), 0x31, 0xdb, // read, stdin
    0xb9, ...imm(buffer), 0xba, ...imm(1), 0xcd, 0x80,
    0xb8, ...imm(1), 0x31, 0xdb, 0xcd, 0x80,
  ];
  const runner = createRunner(uc, { blob, symbols: { _start: 0x08048000 }, success: { type: 'output-contains', value: 'NEVER' } });
  try {
    const result = runner.run(Uint8Array.of(0x41));
    assert.ok(result.stack.length <= 64, 'Snapshot melebihi 256 byte');
    if (buffer < 0xbfff0000) {
      assert.equal(result.stack.length, 0, 'Snapshot membaca di luar stack');
      assert.equal(result.reason, 'bad-read-address', 'Syscall read harus menolak penulisan ke kode');
    }
  } finally { runner.close(); }
}
console.log('Semua challenge terbit tervalidasi memakai binary sebenarnya.');
