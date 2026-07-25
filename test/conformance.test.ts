import { describe, expect, it } from 'vitest';
import {
  DRONE_ADDRESS_CONFORMANCE,
  APPEND_LOG_RESULT_CONFORMANCE,
  ATTACH_SESSION_CONFORMANCE,
  CREATE_CUBE_RETRY_CONFORMANCE,
  CREATE_CUBE_ASSOCIATION_CONFORMANCE,
  RESOLVE_REPOSITORY_CUBE_CONFORMANCE,
  ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE,
  REPOSITORY_CUBE_PERMISSION_CONFORMANCE,
  REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE,
  RUNTIME_METADATA_REPOSITORY_CONFORMANCE,
  ENROLLMENT_AUTHORITY_CONFORMANCE,
  ENROLLMENT_REDACTION_CONFORMANCE,
  ENROLLMENT_RETRY_CONFORMANCE,
  ROLE_SECTION_ROUND_TRIP_CONFORMANCE,
  decodeEnrollmentExchangeRequest,
  decodeEnrollmentExchangeResponse,
  decodeCreateCubeRequest,
  decodeResolveRepositoryCubeRequest,
  decodeAssociateRepositoryCubeRequest,
  decodeAppendLogResult,
  decodeAttachResponse,
  formatDroneAddressToken,
  parseRoleSections,
  redactProtocolDiagnostic,
  canonicalizeRepositoryIdentity,
  serializeSections,
} from '../src/index.js';

describe('public conformance vectors', () => {
  it('pins accepted and rejected append-log routing metadata', () => {
    for (const vector of APPEND_LOG_RESULT_CONFORMANCE) {
      if (vector.accepts) {
        expect(() => decodeAppendLogResult(vector.response), vector.name).not.toThrow();
      } else {
        const response = vector.response as { entry: unknown };
        expect(
          () => decodeAppendLogResult({ entry: response.entry }),
          `${vector.name} permissive control`,
        ).not.toThrow();
        expect(() => decodeAppendLogResult(vector.response), vector.name).toThrow();
      }
    }
  });

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

  it('pins retry tuple equality and mismatch vectors', () => {
    for (const vector of ENROLLMENT_RETRY_CONFORMANCE) {
      const initial = decodeEnrollmentExchangeRequest(vector.initial);
      const retry = decodeEnrollmentExchangeRequest(vector.retry);
      expect(JSON.stringify(retry) === JSON.stringify(initial), vector.name).toBe(
        vector.expected.outcome === 'stable_non_secret_identity',
      );
    }
  });

  it('pins every cube-create retry tuple field', () => {
    for (const vector of CREATE_CUBE_RETRY_CONFORMANCE) {
      const initial = decodeCreateCubeRequest(vector.initial);
      const retry = decodeCreateCubeRequest(vector.retry);
      const retryTuple = ({ retry_key, name, repository, template }: typeof initial) => ({
        retry_key,
        name,
        repository,
        template,
      });
      expect(JSON.stringify(retryTuple(retry)) === JSON.stringify(retryTuple(initial)), vector.name).toBe(
        vector.expected.outcome === 'resolved_response',
      );
    }
  });

  it('pins repository association resolution independently of retry keys', () => {
    const [sameRepository, differentRepository] = CREATE_CUBE_ASSOCIATION_CONFORMANCE;
    expect(sameRepository.request.retry_key).not.toBe(sameRepository.created.retry_key);
    expect(sameRepository.request.repository).toEqual(sameRepository.created.repository);
    expect(sameRepository.expected).toEqual({ outcome: 'resolved', authority_state_delta: {} });
    expect(differentRepository.request.repository).not.toEqual(differentRepository.created.repository);
    expect(differentRepository.expected.outcome).toBe('created');
  });

  it('pins read-only repository resolution and explicit atomic association', () => {
    const [none, resolved] = RESOLVE_REPOSITORY_CUBE_CONFORMANCE;
    expect(decodeResolveRepositoryCubeRequest(none.request)).toEqual(none.request);
    expect(none.expected).toEqual({ outcome: 'none', status: 200, authority_state_delta: {} });
    expect(decodeResolveRepositoryCubeRequest(resolved.request)).toEqual(resolved.request);
    expect(resolved.expected).toEqual({ outcome: 'resolved', status: 200, authority_state_delta: {} });

    const [idempotent, repositoryConflict, cubeConflict] = ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE;
    expect(decodeAssociateRepositoryCubeRequest(idempotent.initial)).toEqual(idempotent.initial);
    expect(idempotent.retry).toEqual(idempotent.initial);
    expect(idempotent.expected.outcome).toBe('resolved');
    expect(repositoryConflict.initial.repository).toEqual(repositoryConflict.retry.repository);
    expect(repositoryConflict.initial.cube_id).not.toBe(repositoryConflict.retry.cube_id);
    expect(repositoryConflict.expected.outcome).toBe('repository_conflict');
    expect('error' in repositoryConflict.expected && repositoryConflict.expected.error)
      .toBe('REPOSITORY_ALREADY_ASSOCIATED');
    expect('diagnostic_disclosure' in repositoryConflict.expected &&
      repositoryConflict.expected.diagnostic_disclosure).toBe('none');
    expect(cubeConflict.initial.cube_id).toBe(cubeConflict.retry.cube_id);
    expect(cubeConflict.initial.repository).not.toEqual(cubeConflict.retry.repository);
    expect(cubeConflict.expected.outcome).toBe('cube_conflict');
    expect('error' in cubeConflict.expected && cubeConflict.expected.error)
      .toBe('CUBE_ALREADY_ASSOCIATED');
    expect('diagnostic_disclosure' in cubeConflict.expected &&
      cubeConflict.expected.diagnostic_disclosure).toBe('none');
    expect(REPOSITORY_CUBE_PERMISSION_CONFORMANCE[0].expected).toEqual({
      status: 403,
      error: 'ACCESS_DENIED',
      authority_state_delta: {},
    });
    expect(REPOSITORY_CUBE_PERMISSION_CONFORMANCE[1].expected).toEqual({
      resolve: { status: 200, outcome: 'none', authority_state_delta: {} },
      associate: {
        status: 403,
        error: 'ACCESS_DENIED',
        diagnostic_disclosure: 'none',
        authority_state_delta: {},
      },
    });
    expect(REPOSITORY_CUBE_PERMISSION_CONFORMANCE[2].expected).toEqual({
      resolve: { status: 200, outcome: 'none', authority_state_delta: {} },
      associate: {
        status: 200,
        outcome: 'resolved',
        authority_state_delta: { repository_associations: 1 },
      },
    });
    expect(REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE[0].expected).toEqual({
      status: 409,
      error: 'INVALID_INPUT',
      diagnostic_disclosure: 'none',
      authority_state_delta: {},
    });
  });

  it('pins ordinary and owner enrollment authority vectors', () => {
    for (const vector of ENROLLMENT_AUTHORITY_CONFORMANCE) {
      const response = decodeEnrollmentExchangeResponse(vector.response);
      expect(response.purpose, vector.name).toBe(vector.response.purpose);
      expect(vector.expected_state_delta, vector.name).toEqual(
        response.purpose === 'owner'
          ? { cubes: 0, roles: 0, grants: 0, server_capabilities: 1 }
          : { cubes: 0, roles: 0, grants: 0, server_capabilities: 0 },
      );
      expect('credential' in response, vector.name).toBe(false);
    }
  });

  it('pins enrollment secret redaction vectors', () => {
    for (const vector of ENROLLMENT_REDACTION_CONFORMANCE) {
      expect(redactProtocolDiagnostic(vector.input), vector.name).toBe(vector.expected);
    }
  });

  it('pins the v3 exact non-expiring attach session', () => {
    for (const vector of ATTACH_SESSION_CONFORMANCE) {
      if (vector.accepts) {
        expect(decodeAttachResponse(vector.response), vector.name).toMatchObject({
          session: { id: '40000000-0000-4000-8000-000000000001' },
        });
      } else {
        expect(() => decodeAttachResponse(vector.response), vector.name).toThrow();
      }
    }
  });

  it('pins the shared repository canonicalization corpus', () => {
    for (const vector of RUNTIME_METADATA_REPOSITORY_CONFORMANCE) {
      if (vector.expected === null) {
        expect(() => canonicalizeRepositoryIdentity(vector.origin), vector.name).toThrow();
      } else {
        expect(canonicalizeRepositoryIdentity(vector.origin), vector.name).toEqual(vector.expected);
      }
    }
  });
});
