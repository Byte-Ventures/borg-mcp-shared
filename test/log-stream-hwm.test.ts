import { describe, expect, it } from 'vitest';
import {
  BROADCAST_HWM_CONFORMANCE,
  compareBroadcastHwm,
  type BroadcastHwm,
} from '../src/index.js';

const FIXTURES: BroadcastHwm[] = [
  { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
  { id: 'b', created_at: '2026-05-29T10:00:00.000Z' },
  { id: 'aa', created_at: '2026-05-29T10:00:00.000Z' },
  { id: 'a', created_at: '2026-05-29T10:00:01.000Z' },
  { id: 'z', created_at: '2026-05-29T09:59:59.000Z' },
  { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
  { id: 'm', created_at: 'not-a-date' },
  { id: 'n', created_at: 'not-a-date' },
  { id: 'm', created_at: '' },
];

describe('compareBroadcastHwm', () => {
  it('is antisymmetric across the existing parity fixture set', () => {
    for (const a of FIXTURES) {
      for (const b of FIXTURES) {
        const forward = Math.sign(compareBroadcastHwm(a, b));
        const reverse = Math.sign(compareBroadcastHwm(b, a));
        expect(forward + reverse).toBe(0);
      }
    }
  });

  it('passes the implementation-neutral conformance vectors', () => {
    for (const vector of BROADCAST_HWM_CONFORMANCE) {
      expect(Math.sign(compareBroadcastHwm(vector.input.a, vector.input.b)), vector.name)
        .toBe(vector.expected);
    }
  });
});
