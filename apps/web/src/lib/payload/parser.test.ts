import { describe, expect, it } from 'vitest';
import { parsePayload } from './parser';

describe('parsePayload', () => {
  it('menggabungkan pengulangan dan p32', () => {
    const value = parsePayload('"A" * 68 + p32(0x0804802d)');
    expect(value).toHaveLength(72);
    expect(Array.from(value.slice(-4))).toEqual([0x2d, 0x80, 0x04, 0x08]);
  });
  it('membatasi hasil ke 4 KiB', () => expect(() => parsePayload('"A" * 4097')).toThrow(/4 KiB|pengulangan/));
  it('menghasilkan pola cyclic', () => expect(new TextDecoder().decode(parsePayload('cyclic(6)'))).toBe('aaaaab'));
  it('menemukan offset EIP sebagai empat byte little-endian', () => {
    const pattern = parsePayload('cyclic(100)');
    const eip = new DataView(pattern.buffer).getUint32(44, true);
    expect(Array.from(parsePayload(`cyclic_find(${eip})`))).toEqual([44, 0, 0, 0]);
  });
  it('menolak pencarian cyclic yang tidak ditemukan', () => expect(() => parsePayload('cyclic_find(0x41414141)')).toThrow(/tidak ditemukan/));
  it('membatasi panjang cyclic termasuk nol', () => {
    expect(parsePayload('cyclic(0)')).toHaveLength(0);
    expect(() => parsePayload('cyclic(4097)')).toThrow(/4096/);
  });
});
