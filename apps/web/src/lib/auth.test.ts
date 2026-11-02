import { describe, expect, it } from 'vitest';
import { isInternalPath, sha256 } from './auth';

describe('auth helpers', () => {
  it('hanya menerima redirect internal', () => {
    expect(isInternalPath('/play/stack')).toBe(true);
    expect(isInternalPath('//example.com')).toBe(false);
    expect(isInternalPath('/\\example.com')).toBe(false);
  });
  it('menghasilkan hash deterministik', async () => {
    expect(await sha256('pwn-labs')).toBe(await sha256('pwn-labs'));
    expect(await sha256('pwn-labs')).not.toBe(await sha256('lain'));
  });
});
