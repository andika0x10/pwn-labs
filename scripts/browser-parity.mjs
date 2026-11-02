import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { fixtures, loadUnicorn, parsePayload } from './level-fixtures.mjs';
import { createRunner } from '../packages/emulator-core/core.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const levels = await fixtures();
const uc = await loadUnicorn();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Pengujian worker harus stabil meski dev server memicu reload saat build lain.
  await page.route('**/@vite/client', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto(base);
  await page.evaluate(() => {
    const worker = new globalThis.Worker('/emulator/worker.js');
    let id = 0;
    const requests = new Map();
    worker.onmessage = ({ data }) => {
      const pending = requests.get(data.id);
      requests.delete(data.id);
      if (data.ok) pending.resolve(data.data);
      else pending.reject(new Error(data.error.message));
    };
    globalThis.paritySend = (message) => new Promise((resolve, reject) => {
      requests.set(++id, { resolve, reject });
      worker.postMessage({ ...message, id });
    });
  });
  // Pergantian dua arah memastikan worker tidak terus menjalankan fixture sebelumnya.
  for (const { id, challenge, solution, negative } of [...levels, ...levels.toReversed()]) {
    const runner = createRunner(uc, challenge);
    try {
      const initial = await page.evaluate((challenge) => globalThis.paritySend({ command: 'load', challenge }), challenge);
      assert.deepEqual(initial, runner.initial(), id + ': initial browser/Node berbeda');
      for (const expression of [negative[0], solution]) {
        const payload = parsePayload(expression);
        const actual = await page.evaluate((payload) => globalThis.paritySend({ command: 'run', payload }), [...payload]);
        assert.deepEqual(actual, runner.run(payload), id + ': browser/Node berbeda');
      }
    } finally { runner.close(); }
    console.log(id + ': register, stack, output, dan kondisi sukses browser/Node identik.');
  }
} finally { await browser.close(); }
