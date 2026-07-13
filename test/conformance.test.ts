import { describe, expect, it } from 'vitest';
import {
  DRONE_ADDRESS_CONFORMANCE,
  ROLE_SECTION_ROUND_TRIP_CONFORMANCE,
  formatDroneAddressToken,
  isProtocolVersionSupported,
  parseRoleSections,
  serializeSections,
} from '../src/index.js';

describe('public conformance vectors', () => {
  it('pins drone address rendering', () => {
    for (const vector of DRONE_ADDRESS_CONFORMANCE) {
      expect(formatDroneAddressToken(vector.input), vector.name).toBe(vector.expected);
    }
  });

  it('pins role-section byte-identical round trips', () => {
    for (const text of ROLE_SECTION_ROUND_TRIP_CONFORMANCE) {
      expect(serializeSections(parseRoleSections(text))).toBe(text);
    }
  });

  it('accepts only declared protocol generations', () => {
    expect(isProtocolVersionSupported('1')).toBe(true);
    expect(isProtocolVersionSupported('2')).toBe(false);
    expect(isProtocolVersionSupported(1)).toBe(false);
  });
});
