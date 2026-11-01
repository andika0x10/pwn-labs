import { describe, expect, it } from 'vitest';
import { score } from './game';

describe('score', () => {
  it('mengurangi sepuluh persen per hint', () => expect(score(120, 2)).toBe(96));
  it('tidak pernah kurang dari setengah poin', () => expect(score(100, 99)).toBe(50));
});
