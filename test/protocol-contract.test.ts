import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_EXCHANGE_PATH,
  CUBES_PATH,
  HEALTH_PATH,
  PROTOCOL_INFO_PATH,
  PROTOCOL_HTTP_CONTRACT,
  SHARED_PACKAGE_NAME,
  SHARED_PACKAGE_VERSION,
  ProtocolContractError,
  createProtocolEnvelope,
  decodeAckLogRequest,
  decodeAppendLogRequest,
  decodeAttachRequest,
  decodeAttachRequestEnvelope,
  decodeAttachResponse,
  decodeAttachResponseEnvelope,
  decodeEnrollmentExchangeRequest,
  decodeEnrollmentExchangeRequestEnvelope,
  decodeEnrollmentExchangeResponse,
  decodeEnrollmentExchangeResponseEnvelope,
  decodeCreateCubeRequest,
  decodeCreateCubeRequestEnvelope,
  decodeCreateCubeResponse,
  decodeCreateCubeResponseEnvelope,
  decodeProtocolEnvelope,
  decodeProtocolErrorEnvelope,
  createProtocolTagPreflight,
  decodeProtocolTagPreflight,
  decodeRecordDecisionRequest,
  decodeReadLogRequest,
  decodeReadLogResult,
  decodeDecision,
  decodeEvictDroneRequest,
  decodeEvictDroneRequestEnvelope,
  decodeEvictDroneResult,
  decodeEvictDroneResultEnvelope,
  decodeReassignDroneRequest,
  decodeReassignDroneRequestEnvelope,
  decodeReassignDroneResult,
  decodeReassignDroneResultEnvelope,
  decodeRemoveDecisionRequest,
  redactProtocolDiagnostic,
  createAttachRequestEnvelope,
} from '../src/index.js';
import * as sharedApi from '../src/index.js';

const tagPreflight = { protocol_version: '3' } as const;

describe('package and handshake contract', () => {
  it('keeps the exported identity aligned with package.json', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string; version: string; publishConfig: { access: string } };

    expect(SHARED_PACKAGE_NAME).toBe('borgmcp-shared');
    expect(SHARED_PACKAGE_VERSION).toBe('0.6.2');
    expect(manifest).toMatchObject({
      name: SHARED_PACKAGE_NAME,
      version: SHARED_PACKAGE_VERSION,
      publishConfig: { access: 'public' },
    });
  });

  it('uses a bodyless health path and a credential-free protocol preflight', () => {
    expect(HEALTH_PATH).toBe('/healthz');
    expect(PROTOCOL_INFO_PATH).toBe('/api/protocol');
    expect(ENROLLMENT_EXCHANGE_PATH).toBe('/api/enrollment/exchange');
    expect(CUBES_PATH).toBe('/api/cubes');
    expect(PROTOCOL_HTTP_CONTRACT).toMatchObject({
      health: { success_status: 204, bodyless: true, authenticated: false },
      protocol: { method: 'GET', success_status: 200, authenticated: false },
      enrollment: { success_status: 201, authenticated: 'invitation' },
      cubes: { success_status: 201, authenticated: true },
      attach: {
        method: 'POST',
        path: '/api/client/attach',
        success_status: 200,
        authenticated: true,
      },
      drone_self_metadata: {
        method: 'PATCH',
        path: '/api/cubes/:cubeId/drones/self/metadata',
        success_status: 200,
        authenticated: 'drone-session',
      },
      drone_reassign: {
        method: 'PATCH',
        path: '/api/cubes/:cubeId/drones/:droneId',
        success_status: 200,
        authenticated: true,
      },
      drone_evict: {
        method: 'DELETE',
        path: '/api/cubes/:cubeId/drones/:droneId',
        success_status: 200,
        authenticated: true,
      },
      drone_evicted_status: 410,
      auth_expired_status: 401,
      session_revoked_status: 401,
      session_rejected_status: 401,
      redirect_policy: 'error',
    });
  });

  it('emits and decodes a tag-only preflight carrying nothing but the exact tag', () => {
    const emitted = createProtocolTagPreflight();
    expect(emitted).toEqual({ protocol_version: '3' });
    expect(Object.keys(emitted)).toEqual(['protocol_version']);
    expect(decodeProtocolTagPreflight(tagPreflight)).toEqual(tagPreflight);
  });

  it('fails the preflight closed on a mismatched tag before any secret', () => {
    expect(() => decodeProtocolTagPreflight({ protocol_version: '2' })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_PROTOCOL_VERSION' }),
    );
    expect(() => decodeProtocolTagPreflight({ protocol_version: '1' })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_PROTOCOL_VERSION' }),
    );
    expect(() => decodeProtocolTagPreflight({ protocol_version: 2 })).toThrow(
      ProtocolContractError,
    );
  });

  it('rejects a preflight carrying any field beyond the exact tag (no fingerprint surface)', () => {
    expect(() =>
      decodeProtocolTagPreflight({ ...tagPreflight, package: { name: 'borgmcp-shared', version: '0.4.2' } }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeProtocolTagPreflight({ ...tagPreflight, limits: { max_request_bytes: 65_536 } }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeProtocolTagPreflight({ ...tagPreflight, capabilities: ['coordination.core'] }),
    ).toThrow(ProtocolContractError);
    expect(() => decodeProtocolTagPreflight('2')).toThrow(ProtocolContractError);
  });

  it('never reflects an untrusted protocol_version at any wrapper boundary', () => {
    // CR 81a57d80/507a7bd8/3660569c, SR 023aa5f7/38601356, RQ 3a7f7ef2/39447b0c:
    // EVERY shared decoder that checks the protocol tag must fail closed with the
    // SAME static ProtocolContractError — exact code + path + static message, no
    // reflected marker — AND must short-circuit before any payload/error body is
    // read. A rogue pinned endpoint must not smuggle arbitrary text (string,
    // array, object, or credential-shaped value) into diagnostics, and a
    // secret-shaped payload must never be decoded when the tag mismatches.
    const marker = 'LEAKED-SECRET-MARKER';
    const errorOf = (fn: () => unknown): ProtocolContractError => {
      try {
        fn();
      } catch (error) {
        if (error instanceof ProtocolContractError) return error;
        // A leaked sentinel from a payload decoder proves the gate did NOT
        // short-circuit before reading the payload.
        throw new Error(`expected a ProtocolContractError, got: ${String(error)}`);
      }
      throw new Error('expected a protocol-version mismatch to throw');
    };
    const hostileValues: unknown[] = [
      marker,
      [marker],
      { toString: () => marker },
      `Bearer ${marker}`,
    ];
    const req = 'req-12345678';
    // Would throw a distinct non-contract sentinel if ever called; combined with a
    // secret-shaped payload this proves the version gate runs before payload decode.
    const sentinelDecoder = (): never => {
      throw new Error('PAYLOAD-DECODER-WAS-CALLED');
    };
    const secretPayload: Record<string, unknown> = { client_credential: marker, [marker]: marker };
    const boundaries: Array<[string, (protocol_version: unknown) => unknown]> = [
      ['tag preflight', (v) => decodeProtocolTagPreflight({ protocol_version: v })],
      ['generic success envelope', (v) => decodeProtocolEnvelope({ protocol_version: v, request_id: req, payload: secretPayload }, sentinelDecoder)],
      ['error envelope', (v) => decodeProtocolErrorEnvelope({ protocol_version: v, error: { code: 'AUTH_INVALID', message: marker } })],
      ['enrollment request envelope', (v) => decodeEnrollmentExchangeRequestEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['enrollment response envelope', (v) => decodeEnrollmentExchangeResponseEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['cube request envelope', (v) => decodeCreateCubeRequestEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['cube response envelope', (v) => decodeCreateCubeResponseEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['attach request envelope', (v) => decodeAttachRequestEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['attach response envelope', (v) => decodeAttachResponseEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['reassign request envelope', (v) => decodeReassignDroneRequestEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['reassign result envelope', (v) => decodeReassignDroneResultEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['evict request envelope', (v) => decodeEvictDroneRequestEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
      ['evict result envelope', (v) => decodeEvictDroneResultEnvelope({ protocol_version: v, request_id: req, payload: secretPayload })],
    ];
    for (const [label, decode] of boundaries) {
      for (const protocol_version of hostileValues) {
        const error = errorOf(() => decode(protocol_version));
        expect(error.message, `${label} reflected input`).toBe('Unsupported protocol version.');
        expect(error.code, `${label} wrong code`).toBe('UNSUPPORTED_PROTOCOL_VERSION');
        expect(error.path, `${label} wrong path`).toEqual(['protocol_version']);
        // message + path + code are the only diagnostic surface; none may carry
        // the marker from the tag value OR the secret-shaped payload.
        expect(
          `${error.message} ${JSON.stringify(error.path)} ${String(error.code)}`,
          `${label} leaked the marker`,
        ).not.toContain(marker);
      }
    }
  });

  it('does not re-export any retired capability-negotiation surface', () => {
    // Regression guard (CR bb7f68c8 / SR ad3d6a95): the exact protocol tag is the
    // sole acceptance authority. None of the deleted negotiation/matrix symbols may
    // return to the public API.
    for (const retired of [
      'negotiateProtocol',
      'SUPPORTED_PROTOCOL_VERSIONS',
      'COMPATIBILITY_MATRIX',
      'REQUIRED_SECURITY_CAPABILITIES',
      'KNOWN_CAPABILITIES',
    ]) {
      expect(sharedApi, `retired export "${retired}" reappeared`).not.toHaveProperty(retired);
    }
    expect(sharedApi.ErrorCode).not.toHaveProperty('UNSUPPORTED_CAPABILITY');
    expect(PROTOCOL_HTTP_CONTRACT).not.toHaveProperty('unsupported_capability_status');
    expect(PROTOCOL_HTTP_CONTRACT.protocol.authenticated).toBe(false);
    expect(decodeProtocolTagPreflight(tagPreflight)).not.toHaveProperty('capabilities');
    for (const retired of ['decodeProtocolInfo', 'decodeProtocolInfoEnvelope', 'negotiateProtocol']) {
      expect(sharedApi, `retired export "${retired}" reappeared`).not.toHaveProperty(retired);
    }
  });

  it('keeps retired negotiation/matrix claims out of the public docs', async () => {
    // Public-doc regression guard (SR ef0cdaf7 / RQ d2a49faf): the runtime-export
    // guard above cannot catch a doc relapse. Scan the public docs for the exact
    // retired identifiers/claims. Deliberate negative prose ("there is no
    // capability negotiation") uses words, not these tokens, so it is allowed.
    const docs = ['README.md', 'docs/compatibility.md', 'docs/enrollment.md', 'docs/releasing.md'];
    const forbidden = [
      /negotiateProtocol/,
      /SUPPORTED_PROTOCOL_VERSIONS/,
      /COMPATIBILITY_MATRIX/,
      /auth\.retry-safe-enrollment/,
      /unsupported[_-]capabilit/i,
    ];
    for (const doc of docs) {
      const text = await readFile(new URL(`../${doc}`, import.meta.url), 'utf8');
      for (const pattern of forbidden) {
        expect(text, `${doc} reintroduced retired term ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('creates a versioned success envelope without accepting an arbitrary version', () => {
    expect(createProtocolEnvelope('req-12345678', { ok: true })).toEqual({
      protocol_version: '3',
      request_id: 'req-12345678',
      payload: { ok: true },
    });
  });

  it('decodes the same versioned envelope at every JSON boundary', () => {
    const payloadDecoder = (payload: unknown) => payload as { ok: boolean };
    const envelope = createProtocolEnvelope('req-12345678', { ok: true });
    expect(decodeProtocolEnvelope(envelope, payloadDecoder)).toEqual(envelope);
    expect(() =>
      decodeProtocolEnvelope({ ...envelope, protocol_version: '1' }, payloadDecoder),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_PROTOCOL_VERSION' }));
  });

  it('decodes canonical errors without accepting secret-bearing fields', () => {
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'req-12345678',
        error: { code: 'AUTH_INVALID', message: 'Authentication failed.' },
      }),
    ).toMatchObject({ error: { code: 'AUTH_INVALID' } });

    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        error: {
          code: 'AUTH_INVALID',
          message: 'Authentication failed.',
          credential: 'secret',
        },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('redacts bearer and opaque-token material from diagnostics', () => {
    const secret = 's'.repeat(43);
    expect(redactProtocolDiagnostic(`Bearer ${secret} failed: ${secret}`)).toBe(
      'Bearer <REDACTED> failed: <REDACTED>',
    );
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        error: { code: 'AUTH_INVALID', message: `Credential ${secret} failed.` },
      }).error.message,
    ).toBe('Credential <REDACTED> failed.');
    expect(redactProtocolDiagnostic(`Credential ${'s'.repeat(42)}- failed.`)).toBe(
      'Credential <REDACTED> failed.',
    );
  });

  it('redacts contextual retry keys without erasing public UUIDs', () => {
    const retryKey = '00000000-0000-4000-8000-000000000101';
    const publicId = '00000000-0000-4000-8000-000000000102';
    expect(redactProtocolDiagnostic(`retry_key=${retryKey} cube_id=${publicId}`)).toBe(
      `retry_key=<REDACTED> cube_id=${publicId}`,
    );
    expect(redactProtocolDiagnostic(`"retry_key":"${retryKey}" client_id=${publicId}`)).toBe(
      `"retry_key":"<REDACTED>" client_id=${publicId}`,
    );
    expect(redactProtocolDiagnostic(`retry_key\n=${retryKey} cube_id=${publicId}`)).toBe(
      `retry_key\\u000a=<REDACTED> cube_id=${publicId}`,
    );
    expect(redactProtocolDiagnostic(`retry_key\t:${retryKey} cube_id=${publicId}`)).toBe(
      `retry_key\\u0009:<REDACTED> cube_id=${publicId}`,
    );
    expect(decodeProtocolErrorEnvelope({
      protocol_version: '3',
      error: {
        code: 'AUTH_INVALID',
        message: `retry-key\n: ${retryKey}`,
        details: `retry_key\t=${retryKey} cube_id=${publicId}`,
      },
    }).error).toEqual({
      code: 'AUTH_INVALID',
      message: 'retry-key\\u000a: <REDACTED>',
      details: `retry_key\\u0009=<REDACTED> cube_id=${publicId}`,
    });
  });

  it('normalizes terminal controls and validates error metadata', () => {
    const normalized = redactProtocolDiagnostic('line1\r\nline2\0\u001b[31mred');
    expect(normalized).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(normalized).toContain('\\u000d\\u000a');

    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'valid-id\r\nInjected',
        error: { code: 'AUTH_INVALID', message: 'Authentication failed.' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects retired capability-negotiation error fields', () => {
    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        error: {
          code: 'AUTH_INVALID',
          message: 'Unsupported.',
          required_capability: 'claims',
        },
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        error: {
          code: 'UNSUPPORTED_PROTOCOL_VERSION',
          message: 'Unsupported.',
          supported_versions: ['2'],
        },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('keeps expired, revoked, takeover, and evicted session outcomes distinct', () => {
    expect(PROTOCOL_HTTP_CONTRACT.auth_expired_status).toBe(401);
    expect(PROTOCOL_HTTP_CONTRACT.session_revoked_status).toBe(401);
    expect(PROTOCOL_HTTP_CONTRACT.session_rejected_status).toBe(401);
    expect(PROTOCOL_HTTP_CONTRACT.drone_evicted_status).toBe(410);
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'req-12345678',
        error: { code: 'AUTH_EXPIRED', message: 'Session expired.' },
      }),
    ).toMatchObject({ error: { code: 'AUTH_EXPIRED' } });
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'req-12345678',
        error: { code: 'SESSION_REVOKED', message: 'Session revoked.' },
      }),
    ).toMatchObject({ error: { code: 'SESSION_REVOKED' } });
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'req-12345678',
        error: { code: 'SESSION_REJECTED', message: 'Seat already bound.' },
      }),
    ).toMatchObject({ error: { code: 'SESSION_REJECTED' } });
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '3',
        request_id: 'req-12345678',
        error: { code: 'DRONE_EVICTED', message: 'This seat was evicted.' },
      }),
    ).toMatchObject({ error: { code: 'DRONE_EVICTED' } });
  });
});

describe('drone-management codecs', () => {
  const cubeId = '10000000-0000-4000-8000-000000000001';
  const droneId = '30000000-0000-4000-8000-000000000001';
  const roleId = '20000000-0000-4000-8000-000000000001';
  const managedDrone = {
    id: droneId,
    cube_id: cubeId,
    role_id: roleId,
    label: 'one-of-one-builder',
  };

  it('strictly decodes reassignment request and success envelopes', () => {
    expect(decodeReassignDroneRequest({ role_id: roleId })).toEqual({ role_id: roleId });
    expect(decodeReassignDroneRequestEnvelope(createProtocolEnvelope('reassign-1', {
      role_id: roleId,
    })).payload).toEqual({ role_id: roleId });
    expect(decodeReassignDroneResult({ drone: managedDrone })).toEqual({ drone: managedDrone });
    expect(decodeReassignDroneResultEnvelope(createProtocolEnvelope('reassign-1', {
      drone: managedDrone,
    })).payload).toEqual({ drone: managedDrone });
  });

  it('rejects malformed reassignment bodies and results', () => {
    expect(() => decodeReassignDroneRequest({ role_id: 'not-a-uuid' }))
      .toThrow(ProtocolContractError);
    expect(() => decodeReassignDroneRequest({ role_id: roleId, role_name: 'Builder' }))
      .toThrow(ProtocolContractError);
    expect(() => decodeReassignDroneResult({
      drone: { ...managedDrone, evicted_at: null },
    })).toThrow(ProtocolContractError);
  });

  it('strictly decodes eviction request and success envelopes', () => {
    expect(decodeEvictDroneRequest({})).toEqual({});
    expect(decodeEvictDroneRequestEnvelope(createProtocolEnvelope('evict-01', {})).payload)
      .toEqual({});
    const result = { drone_id: droneId, evicted: true as const };
    expect(decodeEvictDroneResult(result)).toEqual(result);
    expect(decodeEvictDroneResultEnvelope(createProtocolEnvelope('evict-01', result)).payload)
      .toEqual(result);
  });

  it('rejects ambiguous eviction bodies and results', () => {
    expect(() => decodeEvictDroneRequest({ reason: 'stale' })).toThrow(ProtocolContractError);
    expect(() => decodeEvictDroneResult({ drone_id: droneId, evicted: false }))
      .toThrow(ProtocolContractError);
    expect(() => decodeEvictDroneResult({ drone_id: 'not-a-uuid', evicted: true }))
      .toThrow(ProtocolContractError);
  });
});

describe('enrollment codecs', () => {
  const invitation = 'a'.repeat(43);
  const credential = 'A'.repeat(43);
  const retryKey = '00000000-0000-4000-8000-000000000001';
  const clientId = '00000000-0000-4000-8000-000000000002';

  it('accepts a client-generated credential and retry-safe invitation request body', () => {
    expect(
      decodeEnrollmentExchangeRequest({
        invitation,
        retry_key: retryKey,
        client_credential: credential,
        client_name: 'operator-laptop',
      }),
    ).toEqual({
      invitation,
      retry_key: retryKey,
      client_credential: credential,
      client_name: 'operator-laptop',
    });
    expect(
      decodeEnrollmentExchangeRequestEnvelope(
        createProtocolEnvelope('req-enroll-1', {
          invitation,
          retry_key: retryKey,
          client_credential: credential,
        }),
      ).payload,
    ).toEqual({ invitation, retry_key: retryKey, client_credential: credential });
  });

  it('rejects weak, incomplete, oversized, and ambiguous invitation bodies', () => {
    expect(() => decodeEnrollmentExchangeRequest({ invitation: 'weak' })).toThrow(
      ProtocolContractError,
    );
    expect(() =>
      decodeEnrollmentExchangeRequest({
        invitation: 'a'.repeat(1025),
        retry_key: retryKey,
        client_credential: credential,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({
        invitation,
        retry_key: retryKey,
        client_credential: credential,
        token: invitation,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({
        invitation: `${'a'.repeat(43)}\r\nInjected: yes`,
        retry_key: retryKey,
        client_credential: credential,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({
        invitation,
        retry_key: 'not-a-uuid',
        client_credential: credential,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({
        invitation,
        retry_key: retryKey,
        client_credential: 'B'.repeat(43),
      }),
    ).toThrow(ProtocolContractError);
    for (const malformedCredential of ['A'.repeat(42), 'A'.repeat(44)]) {
      expect(() => decodeEnrollmentExchangeRequest({
        invitation,
        retry_key: retryKey,
        client_credential: malformedCredential,
      })).toThrow(ProtocolContractError);
    }
  });

  it('accepts secret-free ordinary and owner identity responses', () => {
    expect(
      decodeEnrollmentExchangeResponse({
        purpose: 'client',
        client_id: clientId,
        server_capabilities: [],
      }),
    ).toEqual({
      purpose: 'client',
      client_id: clientId,
      server_capabilities: [],
    });
    expect(
      decodeEnrollmentExchangeResponseEnvelope(
        createProtocolEnvelope('req-enroll-1', {
          purpose: 'owner',
          client_id: clientId,
          server_capabilities: ['create_cube'],
        }),
      ).payload,
    ).toEqual({
      purpose: 'owner',
      client_id: clientId,
      server_capabilities: ['create_cube'],
    });
  });

  it('rejects returned bearers, unknown purposes, and malformed owner authority', () => {
    for (const secretField of ['credential', 'client_credential', 'invitation', 'retry_key']) {
      expect(() => decodeEnrollmentExchangeResponse({
        purpose: 'client',
        client_id: clientId,
        server_capabilities: [],
        [secretField]: credential,
      }), secretField).toThrow(ProtocolContractError);
    }
    expect(() =>
      decodeEnrollmentExchangeResponse({
        purpose: 'unknown',
        client_id: clientId,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeResponse({
        purpose: 'owner',
        client_id: clientId,
        cube_id: '00000000-0000-4000-8000-000000000003',
        server_capabilities: ['create_cube'],
      }),
    ).toThrow(ProtocolContractError);
  });
});

describe('cube creation codecs', () => {
  const retryKey = '00000000-0000-4000-8000-000000000011';
  const response = {
    cube_id: '00000000-0000-4000-8000-000000000012',
    human_seat_role_id: '00000000-0000-4000-8000-000000000013',
    default_worker_role_id: '00000000-0000-4000-8000-000000000014',
    access: 'manage' as const,
  };

  it('decodes the closed idempotent request and stable non-secret response', () => {
    const request = { retry_key: retryKey, name: 'borg-mcp', template: 'default' };
    expect(decodeCreateCubeRequest(request)).toEqual(request);
    expect(decodeCreateCubeRequestEnvelope(createProtocolEnvelope('cube-create-1', request)).payload).toEqual(request);
    expect(decodeCreateCubeResponse(response)).toEqual(response);
    expect(decodeCreateCubeResponseEnvelope(createProtocolEnvelope('cube-create-1', response)).payload).toEqual(response);
  });

  it('rejects caller authority, unsupported templates, controls, and returned secrets', () => {
    expect(() => decodeCreateCubeRequest({ retry_key: retryKey, name: 'borg-mcp', template: 'default', owner_id: response.cube_id })).toThrow(ProtocolContractError);
    expect(() => decodeCreateCubeRequest({ retry_key: retryKey, name: 'borg-mcp', template: 'custom' })).toThrow(ProtocolContractError);
    expect(() => decodeCreateCubeRequest({ retry_key: retryKey, name: 'borg\n-mcp', template: 'default' })).toThrow(ProtocolContractError);
    expect(() => decodeCreateCubeResponse({ ...response, credential: 'A'.repeat(43) })).toThrow(ProtocolContractError);
    expect(() => decodeCreateCubeResponse({ ...response, access: 'write' })).toThrow(ProtocolContractError);
  });
});

describe('coordination request codecs', () => {
  it('bounds append-log input and rejects ambiguous fields', () => {
    expect(decodeAppendLogRequest({ message: 'hello', to: ['Coordinator'] })).toEqual({
      message: 'hello',
      to: ['Coordinator'],
    });
    expect(() => decodeAppendLogRequest({ message: '' })).toThrow(ProtocolContractError);
    expect(() => decodeAppendLogRequest({ message: '😀'.repeat(3000) })).toThrow(
      ProtocolContractError,
    );
    expect(() => decodeAppendLogRequest({ message: 'hello', credential: 'secret' })).toThrow(
      ProtocolContractError,
    );
  });

  it('defaults ack kind and rejects unknown kinds', () => {
    const entryId = '00000000-0000-4000-8000-000000000001';
    expect(decodeAckLogRequest({ entry_id: entryId })).toEqual({
      entry_id: entryId,
      kind: 'ack',
    });
    expect(() =>
      decodeAckLogRequest({ entry_id: entryId, kind: 'approve' }),
    ).toThrow(ProtocolContractError);
  });

  it('enforces decision bounds and an exclusive removal selector', () => {
    expect(
      decodeRecordDecisionRequest({ topic: 'server-runtime', decision: 'Use Node 22.' }),
    ).toEqual({ topic: 'server-runtime', decision: 'Use Node 22.' });
    expect(decodeRemoveDecisionRequest({ topic: 'server-runtime' })).toEqual({
      topic: 'server-runtime',
    });
    expect(() =>
      decodeRemoveDecisionRequest({
        topic: 'server-runtime',
        decision_id: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow(ProtocolContractError);
  });

  it('requires positive read limits and a cursor matching the final ordered entry', () => {
    expect(() => decodeReadLogRequest({ cursor: null, limit: 0 })).toThrow(
      ProtocolContractError,
    );
    const entry = {
      id: '30000000-0000-4000-8000-000000000001',
      cube_id: '10000000-0000-4000-8000-000000000001',
      drone_id: '20000000-0000-4000-8000-000000000001',
      message: 'hello',
      visibility: 'broadcast',
      created_at: '2026-07-14T10:00:00.000Z',
      drone_label: 'one-of-one-builder',
      role_name: 'Builder',
      recipient_drone_ids: [],
    };
    expect(() =>
      decodeReadLogResult({
        entries: [entry],
        cursor: { id: entry.id, created_at: '2026-07-14T10:00:01.000Z' },
        behind_by: 0,
        has_more: false,
        claims: [],
      }),
    ).toThrow(ProtocolContractError);
  });

  it('requires decision actor attribution to be a canonical UUID', () => {
    expect(() =>
      decodeDecision({
        id: '40000000-0000-4000-8000-000000000001',
        cube_id: '10000000-0000-4000-8000-000000000001',
        topic: 'runtime',
        decision: 'Node 22',
        rationale: null,
        ratified_by: 'actor\r\nInjected',
        status: 'active',
        supersedes: null,
        created_at: '2026-07-14T10:00:00.000Z',
      }),
    ).toThrow(ProtocolContractError);
  });
});

describe('v3 clean-slate wire types', () => {
  const validAttachRequest = {
    cube_id: '10000000-0000-4000-8000-000000000001',
    role_id: '20000000-0000-4000-8000-000000000001',
    session_credential: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop_0',
  };

  const validAttachResponse = {
    result: 'created' as const,
    cube: { id: '10000000-0000-4000-8000-000000000001', name: 'test-cube' },
    role: { id: '20000000-0000-4000-8000-000000000001', name: 'Builder' },
    drone: {
      id: '30000000-0000-4000-8000-000000000001',
      label: 'forty-of-forty-builder',
      runtime_metadata: {
        agent_kind: null,
        reported_model: null,
        working_repo_name: null,
        working_repo_origin: null,
      },
      runtime_metadata_reported: false,
    },
    session: { id: '40000000-0000-4000-8000-000000000001' },
  };

  it('decodes a valid attach request', () => {
    const decoded = decodeAttachRequest(validAttachRequest);
    expect(decoded.cube_id).toBe(validAttachRequest.cube_id);
    expect(decoded.role_id).toBe(validAttachRequest.role_id);
    expect(decoded.session_credential).toBe(validAttachRequest.session_credential);
    expect(decoded.prior_drone_id).toBeUndefined();
  });

  it('decodes attach request with optional prior_drone_id', () => {
    const withPrior = { ...validAttachRequest, prior_drone_id: '50000000-0000-4000-8000-000000000001' };
    const decoded = decodeAttachRequest(withPrior);
    expect(decoded.prior_drone_id).toBe(withPrior.prior_drone_id);
  });

  it('rejects attach request with unknown keys', () => {
    expect(() =>
      decodeAttachRequest({ ...validAttachRequest, retry_key: 'extra' }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach request with missing cube_id', () => {
    const { cube_id: _, ...rest } = validAttachRequest;
    expect(() => decodeAttachRequest(rest)).toThrow(ProtocolContractError);
  });

  it('rejects attach request with missing session_credential', () => {
    const { session_credential: _, ...rest } = validAttachRequest;
    expect(() => decodeAttachRequest(rest)).toThrow(ProtocolContractError);
  });

  it('rejects attach request with invalid session_credential format', () => {
    expect(() =>
      decodeAttachRequest({ ...validAttachRequest, session_credential: 'too-short' }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach request with non-UUID cube_id', () => {
    expect(() =>
      decodeAttachRequest({ ...validAttachRequest, cube_id: 'not-a-uuid' }),
    ).toThrow(ProtocolContractError);
  });

  it('decodes a valid attach response with result "created"', () => {
    const decoded = decodeAttachResponse(validAttachResponse);
    expect(decoded.result).toBe('created');
    expect(decoded.cube.name).toBe('test-cube');
    expect(decoded.session.id).toBe('40000000-0000-4000-8000-000000000001');
  });

  it('decodes a valid attach response with result "reused"', () => {
    const reused = { ...validAttachResponse, result: 'reused' as const };
    const decoded = decodeAttachResponse(reused);
    expect(decoded.result).toBe('reused');
  });

  it('rejects attach response with unknown result discriminant', () => {
    expect(() =>
      decodeAttachResponse({ ...validAttachResponse, result: 'rotated' }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with expires_at', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: { ...validAttachResponse.session, expires_at: '2026-07-18T15:00:00.000Z' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with null expires_at', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: { ...validAttachResponse.session, expires_at: null },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with missing session id', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: {},
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with non-UUID session id', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: { id: 'not-a-uuid' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with unknown session fields', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: { ...validAttachResponse.session, token: 'extra' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with unknown top-level keys', () => {
    expect(() =>
      decodeAttachResponse({ ...validAttachResponse, generation: 2 }),
    ).toThrow(ProtocolContractError);
  });

  it('decodes attach response with optional role fields', () => {
    const withRoleClass = {
      ...validAttachResponse,
      role: { ...validAttachResponse.role, role_class: 'worker', is_human_seat: false },
    };
    const decoded = decodeAttachResponse(withRoleClass);
    expect(decoded.role.role_class).toBe('worker');
    expect(decoded.role.is_human_seat).toBe(false);
  });

  it('rejects attach response with unknown role_class', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        role: { ...validAttachResponse.role, role_class: 'builder' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('rejects attach response with non-queen/non-worker role_class', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        role: { ...validAttachResponse.role, role_class: 'admin' },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('accepts role_class "queen"', () => {
    const decoded = decodeAttachResponse({
      ...validAttachResponse,
      role: { ...validAttachResponse.role, role_class: 'queen' },
    });
    expect(decoded.role.role_class).toBe('queen');
  });

  it('decodes attach response envelope with correct protocol version', () => {
    const envelope = {
      protocol_version: '3',
      request_id: 'test-request-id-123',
      payload: validAttachResponse,
    };
    const decoded = decodeAttachResponseEnvelope(envelope);
    expect(decoded.protocol_version).toBe('3');
    expect(decoded.payload.result).toBe('created');
  });

  it('rejects attach response envelope with wrong protocol version', () => {
    const envelope = {
      protocol_version: '2',
      request_id: 'test-request-id-123',
      payload: validAttachResponse,
    };
    expect(() => decodeAttachResponseEnvelope(envelope)).toThrow(ProtocolContractError);
  });

  it('rejects attach response envelope with unknown protocol version', () => {
    const envelope = {
      protocol_version: '4',
      request_id: 'test-request-id-123',
      payload: validAttachResponse,
    };
    expect(() => decodeAttachResponseEnvelope(envelope)).toThrow(ProtocolContractError);
  });

  it('rejects attach response with an additional session field', () => {
    expect(() =>
      decodeAttachResponse({
        ...validAttachResponse,
        session: { ...validAttachResponse.session, lifetime: 'forever' },
      }),
    ).toThrow(ProtocolContractError);
  });

  // ── Request envelope tests ─────────────────────────────────────────────

  it('creates and decodes a valid attach request envelope round-trip', () => {
    const envelope = createAttachRequestEnvelope('test-req-001', validAttachRequest);
    expect(envelope.protocol_version).toBe('3');
    expect(envelope.request_id).toBe('test-req-001');
    expect(envelope.payload.cube_id).toBe(validAttachRequest.cube_id);

    const decoded = decodeAttachRequestEnvelope(envelope);
    expect(decoded.payload.cube_id).toBe(validAttachRequest.cube_id);
    expect(decoded.payload.session_credential).toBe(validAttachRequest.session_credential);
  });

  it('decodes attach request envelope from raw JSON', () => {
    const raw = {
      protocol_version: '3',
      request_id: 'test-req-002',
      payload: validAttachRequest,
    };
    const decoded = decodeAttachRequestEnvelope(raw);
    expect(decoded.payload.cube_id).toBe(validAttachRequest.cube_id);
  });

  it('rejects attach request envelope with wrong protocol version BEFORE decoding payload', () => {
    const raw = {
      protocol_version: '2',
      request_id: 'test-req-003',
      payload: validAttachRequest,
    };
    expect(() => decodeAttachRequestEnvelope(raw)).toThrow(ProtocolContractError);
  });

  it('rejects attach request envelope with unknown protocol version', () => {
    const raw = {
      protocol_version: '99',
      request_id: 'test-req-004',
      payload: validAttachRequest,
    };
    expect(() => decodeAttachRequestEnvelope(raw)).toThrow(ProtocolContractError);
  });

  it('wrong-protocol-version error does not leak session_credential', () => {
    const malicious = {
      protocol_version: '1',
      request_id: 'test-req-005',
      payload: { ...validAttachRequest, session_credential: 'LEAKED_SECRET_VALUE_HERE_1234567890abcdefg' },
    };
    let caught: unknown;
    try {
      decodeAttachRequestEnvelope(malicious);
      throw new Error('Expected ProtocolContractError');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProtocolContractError);
    const message = (caught as ProtocolContractError).message;
    expect(message).not.toContain('LEAKED');
    expect(message).not.toContain('session_credential');
    expect(message).toBe('Unsupported protocol version.');
  });

  it('malformed/oversized session_credential does not reflect secret in error', () => {
    const bad = {
      cube_id: validAttachRequest.cube_id,
      role_id: validAttachRequest.role_id,
      session_credential: 'x'.repeat(2000),
    };
    let caught: unknown;
    try {
      decodeAttachRequest(bad);
      throw new Error('Expected ProtocolContractError');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProtocolContractError);
    const message = (caught as ProtocolContractError).message;
    expect(message).not.toContain('x'.repeat(2000));
    expect(message).not.toContain('session_credential');
  });
});
