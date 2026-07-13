import { describe, expect, it } from 'vitest';
import { shortDroneId, formatDroneAddressToken } from '../src/drone-address.js';

describe('shortDroneId (gh#371)', () => {
  it('is the first 8 hex of the drone_id (a valid startsWith prefix of the full id)', () => {
    const id = '3336cde1-a76e-4e89-8bc2-77c149bb6a74';
    expect(shortDroneId(id)).toBe('3336cde1');
    // must be a prefix the worker resolver can startsWith-match against the full id
    expect(id.toLowerCase().startsWith(shortDroneId(id))).toBe(true);
  });

  it('lowercases so it matches the resolver regex /^[0-9a-f]{8,}$/i', () => {
    expect(shortDroneId('3336CDE1-AAAA-...')).toBe('3336cde1');
    expect(shortDroneId('3336cde1-a76e-4e89-8bc2-77c149bb6a74')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('formatDroneAddressToken (gh#371 finding-2)', () => {
  const id = '3336cde1-a76e-4e89-8bc2-77c149bb6a74';

  it('renders a clearly-labeled address token containing the short-uuid', () => {
    const token = formatDroneAddressToken(id);
    expect(token).toContain('id:');
    expect(token).toContain('3336cde1');
  });

  it('is visually distinct from the [entry_id: …] bracket (no bracket-mimicking)', () => {
    const token = formatDroneAddressToken(id);
    expect(token).not.toContain('entry_id');
    expect(token).not.toContain('[');
  });
});
