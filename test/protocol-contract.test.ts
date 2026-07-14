import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_EXCHANGE_PATH,
  HEALTH_PATH,
  PROTOCOL_INFO_PATH,
  REQUIRED_SECURITY_CAPABILITIES,
  SHARED_PACKAGE_NAME,
  SHARED_PACKAGE_VERSION,
  ProtocolContractError,
  createProtocolEnvelope,
  decodeAckLogRequest,
  decodeAppendLogRequest,
  decodeEnrollmentExchangeRequest,
  decodeEnrollmentExchangeResponse,
  decodeProtocolEnvelope,
  decodeProtocolErrorEnvelope,
  decodeProtocolInfo,
  decodeRecordDecisionRequest,
  decodeRemoveDecisionRequest,
  negotiateProtocol,
  redactProtocolDiagnostic,
} from '../src/index.js';

const protocolInfo = {
  protocol_version: '1',
  package: {
    name: '@borgmcp/shared',
    version: '0.2.0',
  },
  capabilities: [
    'coordination.core',
    'auth.bearer',
    'auth.revocation',
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
    ) as { name: string; version: string };

    expect(SHARED_PACKAGE_NAME).toBe('@borgmcp/shared');
    expect(SHARED_PACKAGE_VERSION).toBe('0.2.0');
    expect(manifest).toMatchObject({
      name: SHARED_PACKAGE_NAME,
      version: SHARED_PACKAGE_VERSION,
    });
  });

  it('uses one bodyless health path and authenticated protocol/enrollment paths', () => {
    expect(HEALTH_PATH).toBe('/healthz');
    expect(PROTOCOL_INFO_PATH).toBe('/api/protocol');
    expect(ENROLLMENT_EXCHANGE_PATH).toBe('/api/enrollment/exchange');
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
  });

  it('negotiates the current protocol and required optional capabilities', () => {
    expect(negotiateProtocol(protocolInfo, ['claims'])).toEqual(protocolInfo);
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
  });
});

describe('enrollment codecs', () => {
  const invitation = 'a'.repeat(43);
  const credential = 'b'.repeat(43);

  it('accepts a bounded single-use invitation request body', () => {
    expect(
      decodeEnrollmentExchangeRequest({
        invitation,
        client_name: 'operator-laptop',
      }),
    ).toEqual({ invitation, client_name: 'operator-laptop' });
  });

  it('rejects weak, oversized, and ambiguous invitation bodies', () => {
    expect(() => decodeEnrollmentExchangeRequest({ invitation: 'weak' })).toThrow(
      ProtocolContractError,
    );
    expect(() =>
      decodeEnrollmentExchangeRequest({ invitation: 'a'.repeat(1025) }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({ invitation, token: invitation }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeRequest({ invitation: `${'a'.repeat(43)}\r\nInjected: yes` }),
    ).toThrow(ProtocolContractError);
  });

  it('accepts a one-time credential response and rejects extra secret fields', () => {
    expect(
      decodeEnrollmentExchangeResponse({
        client_id: 'client-12345678',
        credential,
        credential_expires_at: null,
      }),
    ).toEqual({
      client_id: 'client-12345678',
      credential,
      credential_expires_at: null,
    });

    expect(() =>
      decodeEnrollmentExchangeResponse({
        client_id: 'client-12345678',
        credential,
        recovery_secret: credential,
      }),
    ).toThrow(ProtocolContractError);
    expect(() =>
      decodeEnrollmentExchangeResponse({
        client_id: 'client-12345678\nInjected',
        credential,
      }),
    ).toThrow(ProtocolContractError);
  });
});

describe('coordination request codecs', () => {
  it('bounds append-log input and rejects ambiguous fields', () => {
    expect(decodeAppendLogRequest({ message: 'hello', to: ['Coordinator'] })).toEqual({
      message: 'hello',
      to: ['Coordinator'],
    });
    expect(() => decodeAppendLogRequest({ message: '' })).toThrow(ProtocolContractError);
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
});
