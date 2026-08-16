import { describe, expect, it } from 'vitest';
import {
  DRONE_ADDRESS_CONFORMANCE,
  APPEND_LOG_RESULT_CONFORMANCE,
  APPEND_LOG_REQUEST_CONFORMANCE,
  APPEND_LOG_IDEMPOTENCY_CONFORMANCE,
  ATTACH_SESSION_CONFORMANCE,
  CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE,
  CREATE_CUBE_RETRY_CONFORMANCE,
  CREATE_CUBE_ASSOCIATION_CONFORMANCE,
  DELETE_CUBE_CONFORMANCE,
  RESOLVE_REPOSITORY_CUBE_CONFORMANCE,
  ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE,
  REPOSITORY_CUBE_PERMISSION_CONFORMANCE,
  REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE,
  RUNTIME_METADATA_REPOSITORY_CONFORMANCE,
  ENROLLMENT_AUTHORITY_CONFORMANCE,
  ENROLLMENT_REDACTION_CONFORMANCE,
  ENROLLMENT_RETRY_CONFORMANCE,
  ROLE_SECTION_ROUND_TRIP_CONFORMANCE,
  ROLE_DELETE_CONFORMANCE,
  ROLE_RATIONALE_CONFORMANCE,
  decodeEnrollmentExchangeRequest,
  decodeEnrollmentExchangeResponse,
  decodeCreateCubeRequest,
  decodeDeleteCubeRequest,
  decodeResolveRepositoryCubeRequest,
  decodeAssociateRepositoryCubeRequest,
  decodeAppendLogResult,
  decodeAppendLogRequest,
  decodeAttachResponse,
  formatDroneAddressToken,
  parseRoleSections,
  redactProtocolDiagnostic,
  canonicalizeRepositoryIdentity,
  serializeSections,
} from '../src/index.js';

describe('public conformance vectors', () => {
  it('pins every author-scoped append identity outcome', () => {
    expect(APPEND_LOG_IDEMPOTENCY_CONFORMANCE).toEqual([
      expect.objectContaining({ actor: 'same', mutation: 'none', expected: 'deduplicated' }),
      expect.objectContaining({ actor: 'same', mutation: 'message', expected: 'POST_ID_CONFLICT' }),
      expect.objectContaining({ actor: 'same', mutation: 'visibility', expected: 'POST_ID_CONFLICT' }),
      expect.objectContaining({ actor: 'same', mutation: 'recipient_set', expected: 'POST_ID_CONFLICT' }),
      expect.objectContaining({ actor: 'same', mutation: 'ignored_request_shape', expected: 'deduplicated' }),
      expect.objectContaining({ actor: 'same', mutation: 'resolved_class_routing', expected: 'POST_ID_CONFLICT' }),
      expect.objectContaining({ actor: 'different', mutation: 'none', expected: 'created' }),
    ]);
  });

  it('pins exact append-log idempotency requests', () => {
    for (const vector of APPEND_LOG_REQUEST_CONFORMANCE) {
      if (vector.accepts) {
        expect(() => decodeAppendLogRequest(vector.request), vector.name).not.toThrow();
      } else {
        expect(() => decodeAppendLogRequest(vector.request), vector.name).toThrow();
      }
    }
  });

  it('pins accepted and rejected append-log routing metadata', () => {
    for (const vector of APPEND_LOG_RESULT_CONFORMANCE) {
      if (vector.accepts) {
        expect(() => decodeAppendLogResult(vector.response), vector.name).not.toThrow();
      } else {
        const response = vector.response as { entry: unknown };
        expect(
          () => decodeAppendLogResult({ entry: response.entry, deduplicated: false }),
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

  it('pins every role-deletion refusal and the actionable in-use message', () => {
    expect(ROLE_DELETE_CONFORMANCE.map((vector) => vector.expected)).toEqual([
      { status: 200, response: { deleted: true }, mutation: 'delete-role' },
      {
        status: 200,
        response: { deleted: true },
        mutation: 'delete-role',
        evicted_drone_retarget: 'default-role',
        activity_log_attribution: 'preserved',
      },
      {
        status: 409,
        error: 'ROLE_IN_USE',
        mutation: 'none',
        message: 'Reassign or evict every drone assigned to this role before deleting it.',
      },
      { status: 409, error: 'DEFAULT_ROLE_REQUIRED', mutation: 'none' },
      { status: 409, error: 'ROLE_REQUIRED', mutation: 'none' },
      { status: 409, error: 'ROLE_REQUIRED', mutation: 'none' },
      { status: 409, error: 'ROLE_REFERENCED', mutation: 'none' },
      { status: 404, error: 'NOT_FOUND', mutation: 'none' },
    ]);
  });

  it('pins rationale resolution and every typed lookup refusal', () => {
    expect(ROLE_RATIONALE_CONFORMANCE.map((vector) => vector.expected)).toEqual([
      { status: 200, canonical_heading: true, exact_body: true, mutation: 'none' },
      { status: 200, canonical_heading: true, exact_body: true, mutation: 'none' },
      { status: 404, error: 'ROLE_NOT_FOUND', mutation: 'none' },
      { status: 404, error: 'ROLE_NOT_FOUND', mutation: 'none' },
      { status: 404, error: 'ROLE_SECTION_NOT_FOUND', mutation: 'none' },
      { status: 400, error: 'INVALID_INPUT', mutation: 'none' },
      { status: 400, error: 'INVALID_INPUT', mutation: 'none' },
    ]);
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

  it('pins the complete protocol-v11 cube-template acceptance set', () => {
    for (const vector of CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE) {
      const request = {
        retry_key: '00000000-0000-4000-8000-000000000120',
        name: 'Template Contract',
        working_repo_name: 'template-contract',
        repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000120' },
        template: vector.template,
      };
      if (vector.accepts) {
        expect(decodeCreateCubeRequest(request).template, vector.name).toBe(vector.template);
      } else {
        expect(() => decodeCreateCubeRequest(request), vector.name).toThrow();
      }
    }
  });

  it('pins cascading deletion and durable terminal-state vectors', () => {
    for (const vector of DELETE_CUBE_CONFORMANCE) {
      expect(decodeDeleteCubeRequest(vector.request), vector.name).toEqual({});
    }
    expect(DELETE_CUBE_CONFORMANCE).toEqual([
      expect.objectContaining({ expected: { status: 200, response: { deleted: true }, mutation: 'cascade' } }),
      expect.objectContaining({ expected: { status: 403, error: 'ACCESS_DENIED', mutation: 'none' } }),
      expect.objectContaining({ expected: { status: 404, error: 'NOT_FOUND', mutation: 'none' } }),
      expect.objectContaining({
        expected: expect.objectContaining({
          status: 410,
          error: 'CUBE_DELETED',
          terminal_sse: { event: 'error', error: 'CUBE_DELETED', closes_after_event: true },
        }),
      }),
      expect.objectContaining({
        expected: expect.objectContaining({
          status: 410,
          error: 'CUBE_DELETED',
          durable_after_restart: true,
        }),
      }),
    ]);
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
