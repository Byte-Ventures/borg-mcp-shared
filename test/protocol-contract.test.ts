import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_EXCHANGE_PATH,
  CUBES_PATH,
  HEALTH_PATH,
  COMPATIBILITY_MATRIX,
  PROTOCOL_INFO_PATH,
  PROTOCOL_HTTP_CONTRACT,
  REQUIRED_SECURITY_CAPABILITIES,
  SHARED_PACKAGE_NAME,
  SHARED_PACKAGE_VERSION,
  ProtocolContractError,
  createProtocolEnvelope,
  decodeAckLogRequest,
  decodeAppendLogRequest,
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
  decodeProtocolInfo,
  decodeProtocolInfoEnvelope,
  decodeRecordDecisionRequest,
  decodeReadLogRequest,
  decodeReadLogResult,
  decodeDecision,
  decodeRemoveDecisionRequest,
  negotiateProtocol,
  redactProtocolDiagnostic,
} from '../src/index.js';

const protocolInfo = {
  protocol_version: '1',
  package: {
    name: 'borgmcp-shared',
    version: '0.2.2',
  },
  capabilities: [
    'coordination.core',
    'auth.bearer',
    'auth.revocation',
    'auth.retry-safe-enrollment',
    'scope.cube-isolation',
    'transport.tls',
    'authority.no-cloud-fallback',
    'log.cursor',
    'stream.sse',
    'stream.replay',
    'acks',
    'claims',
    'decisions',
  ],
  limits: {
    max_request_bytes: 65_536,
    max_log_message_bytes: 10_240,
    max_read_page_size: 500,
    max_replay_page_size: 200,
  },
} as const;

describe('package and handshake contract', () => {
  it('keeps the exported identity aligned with package.json', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string; version: string; publishConfig: { access: string } };

    expect(SHARED_PACKAGE_NAME).toBe('borgmcp-shared');
    expect(SHARED_PACKAGE_VERSION).toBe('0.2.2');
    expect(manifest).toMatchObject({
      name: SHARED_PACKAGE_NAME,
      version: SHARED_PACKAGE_VERSION,
      publishConfig: { access: 'public' },
    });
    expect(COMPATIBILITY_MATRIX[0]?.packageRange).toBe('>=0.2.0 <0.3.0');
  });

  it('uses one bodyless health path and authenticated protocol/enrollment paths', () => {
    expect(HEALTH_PATH).toBe('/healthz');
    expect(PROTOCOL_INFO_PATH).toBe('/api/protocol');
    expect(ENROLLMENT_EXCHANGE_PATH).toBe('/api/enrollment/exchange');
    expect(CUBES_PATH).toBe('/api/cubes');
    expect(PROTOCOL_HTTP_CONTRACT).toMatchObject({
      health: { success_status: 204, bodyless: true, authenticated: false },
      protocol: { success_status: 200, authenticated: true },
      enrollment: { success_status: 201, authenticated: 'invitation' },
      cubes: { success_status: 201, authenticated: true },
      redirect_policy: 'error',
    });
  });

  it('decodes an exact protocol manifest and rejects unknown fields', () => {
    expect(decodeProtocolInfo(protocolInfo)).toEqual(protocolInfo);
    expect(() => decodeProtocolInfo({ ...protocolInfo, telemetry: true })).toThrow(
      ProtocolContractError,
    );
  });

  it('rejects server limits above local safety ceilings', () => {
    expect(() =>
      decodeProtocolInfo({
        ...protocolInfo,
        limits: { ...protocolInfo.limits, max_read_page_size: 1_000_000 },
      }),
    ).toThrow(ProtocolContractError);
  });

  it('fails closed when a security capability is missing', () => {
    const withoutRevocation = {
      ...protocolInfo,
      capabilities: protocolInfo.capabilities.filter(
        (capability) => capability !== 'auth.revocation',
      ),
    };

    expect(() => negotiateProtocol(withoutRevocation)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_CAPABILITY' }),
    );
    expect(REQUIRED_SECURITY_CAPABILITIES).toContain('auth.revocation');
    expect(REQUIRED_SECURITY_CAPABILITIES).toContain('auth.retry-safe-enrollment');
  });

  it('negotiates the current protocol and required optional capabilities', () => {
    expect(negotiateProtocol(protocolInfo, ['claims'])).toEqual(protocolInfo);
  });

  it('preserves safe additive capability names for forward compatibility', () => {
    const withFutureCapability = {
      ...protocolInfo,
      capabilities: [...protocolInfo.capabilities, 'future.optional'],
    };
    expect(decodeProtocolInfo(withFutureCapability).capabilities).toContain('future.optional');
  });

  it('creates a versioned success envelope without accepting an arbitrary version', () => {
    expect(createProtocolEnvelope('req-12345678', { ok: true })).toEqual({
      protocol_version: '1',
      request_id: 'req-12345678',
      payload: { ok: true },
    });
  });

  it('decodes the same versioned envelope at every JSON boundary', () => {
    const envelope = createProtocolEnvelope('req-12345678', protocolInfo);
    expect(decodeProtocolEnvelope(envelope, decodeProtocolInfo)).toEqual(envelope);
    expect(decodeProtocolInfoEnvelope(envelope)).toEqual(envelope);
    expect(() =>
      decodeProtocolEnvelope({ ...envelope, protocol_version: '2' }, decodeProtocolInfo),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_PROTOCOL_VERSION' }));
  });

  it('decodes canonical errors without accepting secret-bearing fields', () => {
    expect(
      decodeProtocolErrorEnvelope({
        protocol_version: '1',
        request_id: 'req-12345678',
        error: { code: 'AUTH_INVALID', message: 'Authentication failed.' },
      }),
    ).toMatchObject({ error: { code: 'AUTH_INVALID' } });

    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '1',
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
        protocol_version: '1',
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
    expect(decodeProtocolErrorEnvelope({
      protocol_version: '1',
      error: {
        code: 'AUTH_INVALID',
        message: `retry-key: ${retryKey}`,
        details: `retry_key=${retryKey} cube_id=${publicId}`,
      },
    }).error).toEqual({
      code: 'AUTH_INVALID',
      message: 'retry-key: <REDACTED>',
      details: `retry_key=<REDACTED> cube_id=${publicId}`,
    });
  });

  it('normalizes terminal controls and validates error metadata', () => {
    const normalized = redactProtocolDiagnostic('line1\r\nline2\0\u001b[31mred');
    expect(normalized).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(normalized).toContain('\\u000d\\u000a');

    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '1',
        request_id: 'valid-id\r\nInjected',
        error: { code: 'AUTH_INVALID', message: 'Authentication failed.' },
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '1',
        error: {
          code: 'UNSUPPORTED_CAPABILITY',
          message: 'Unsupported.',
          required_capability: 'claims\r\nInjected',
        },
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeProtocolErrorEnvelope({
        protocol_version: '1',
        error: {
          code: 'UNSUPPORTED_PROTOCOL_VERSION',
          message: 'Unsupported.',
          supported_versions: Array(17).fill('1'),
        },
      }),
    ).toThrow(ProtocolContractError);
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

  it('accepts SemVer build metadata and rejects leading-zero prerelease numbers', () => {
    expect(
      decodeProtocolInfo({
        ...protocolInfo,
        package: { name: 'borgmcp-shared', version: '0.2.2+build.1' },
      }).package.version,
    ).toBe('0.2.2+build.1');
    expect(() =>
      decodeProtocolInfo({
        ...protocolInfo,
        package: { name: 'borgmcp-shared', version: '0.2.2-01' },
      }),
    ).toThrow(ProtocolContractError);
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
