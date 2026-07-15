import { describe, expect, it } from 'vitest';
import {
  DRONE_ADDRESS_CONFORMANCE,
  ENROLLMENT_AUTHORITY_CONFORMANCE,
  ENROLLMENT_REDACTION_CONFORMANCE,
  ENROLLMENT_RETRY_CONFORMANCE,
  ROLE_SECTION_ROUND_TRIP_CONFORMANCE,
  decodeEnrollmentExchangeRequest,
  decodeEnrollmentExchangeResponse,
  formatDroneAddressToken,
  isProtocolVersionSupported,
  parseRoleSections,
  redactProtocolDiagnostic,
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

  it('pins retry tuple equality and mismatch vectors', () => {
    for (const vector of ENROLLMENT_RETRY_CONFORMANCE) {
      const initial = decodeEnrollmentExchangeRequest(vector.initial);
      const retry = decodeEnrollmentExchangeRequest(vector.retry);
      expect(JSON.stringify(retry) === JSON.stringify(initial), vector.name).toBe(
        vector.expected.outcome === 'stable_non_secret_identity',
      );
    }
  });

  it('pins ordinary and bootstrap enrollment authority vectors', () => {
    for (const vector of ENROLLMENT_AUTHORITY_CONFORMANCE) {
      const response = decodeEnrollmentExchangeResponse(vector.response);
      expect(response.purpose, vector.name).toBe(vector.response.purpose);
      expect(vector.expected_created_grants, vector.name).toBe(
        response.purpose === 'bootstrap' ? 1 : 0,
      );
      expect('credential' in response, vector.name).toBe(false);
    }
  });

  it('pins enrollment secret redaction vectors', () => {
    for (const vector of ENROLLMENT_REDACTION_CONFORMANCE) {
      expect(redactProtocolDiagnostic(vector.input), vector.name).toBe(vector.expected);
    }
  });
});
