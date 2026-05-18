import { describe, expect, it } from 'vitest';
import { ulawToPcm16 } from '../src/kvs/reader.js';

describe('ulawToPcm16', () => {
  it('decodes silence (0xff) to ~0', () => {
    const out = ulawToPcm16(Buffer.from([0xff, 0xff, 0xff, 0xff]));
    expect(out.length).toBe(8);
    for (let i = 0; i < 8; i += 2) {
      expect(Math.abs(out.readInt16LE(i))).toBeLessThanOrEqual(8);
    }
  });

  it('produces opposite signs for inverted MSB', () => {
    const positive = ulawToPcm16(Buffer.from([0x7f])).readInt16LE(0);
    const negative = ulawToPcm16(Buffer.from([0xff])).readInt16LE(0);
    expect(Math.sign(positive)).not.toBe(Math.sign(negative));
  });
});
