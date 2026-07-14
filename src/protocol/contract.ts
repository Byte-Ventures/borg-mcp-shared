import { ErrorCode } from './errors.js';
import { PROTOCOL_VERSION, type ProtocolVersion } from './version.js';

export const SHARED_PACKAGE_NAME = '@borgmcp/shared' as const;
export const SHARED_PACKAGE_VERSION = '0.2.0' as const;

export const HEALTH_PATH = '/healthz' as const;
export const PROTOCOL_INFO_PATH = '/api/protocol' as const;
export const ENROLLMENT_EXCHANGE_PATH = '/api/enrollment/exchange' as const;

export const KNOWN_CAPABILITIES = [
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
] as const;

export type Capability = (typeof KNOWN_CAPABILITIES)[number];

export const REQUIRED_SECURITY_CAPABILITIES = [
  'auth.bearer',
  'auth.revocation',
  'scope.cube-isolation',
  'transport.tls',
  'authority.no-cloud-fallback',
] as const satisfies readonly Capability[];

export interface ProtocolLimits {
  max_request_bytes: number;
  max_log_message_bytes: number;
  max_read_page_size: number;
  max_replay_page_size: number;
}

export interface ProtocolInfo {
  protocol_version: ProtocolVersion;
  package: {
    name: typeof SHARED_PACKAGE_NAME;
    version: string;
  };
  capabilities: Capability[];
  limits: ProtocolLimits;
}

export interface ProtocolEnvelope<T> {
  protocol_version: ProtocolVersion;
  request_id: string;
  payload: T;
}

export interface ProtocolErrorEnvelope {
  protocol_version: ProtocolVersion;
  request_id?: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: string;
    retry_after?: number;
    required_capability?: string;
    supported_versions?: readonly string[];
  };
}

/** Invitation and returned bearer values are opaque secrets, never identifiers. */
export interface EnrollmentExchangeRequest {
  invitation: string;
  client_name?: string;
}

/** The credential is returned once and must not be persisted by server adapters. */
export interface EnrollmentExchangeResponse {
  client_id: string;
  credential: string;
  credential_expires_at?: string | null;
}

export interface LogCursor {
  id: string;
  created_at: string;
}

export class ProtocolContractError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode = ErrorCode.INVALID_INPUT,
    public readonly path: readonly (string | number)[] = [],
  ) {
    super(message);
    this.name = 'ProtocolContractError';
  }
}

function fail(message: string, path: readonly (string | number)[] = []): never {
  throw new ProtocolContractError(message, ErrorCode.INVALID_INPUT, path);
}

function record(value: unknown, path: readonly (string | number)[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('Expected an object.', path);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: readonly (string | number)[] = [],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`Unknown field "${key}".`, [...path, key]);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`Missing field "${key}".`, [...path, key]);
    }
  }
}

function boundedString(
  value: unknown,
  min: number,
  max: number,
  path: readonly (string | number)[],
): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    fail(`Expected a string between ${min} and ${max} characters.`, path);
  }
  return value;
}

function positiveInteger(value: unknown, path: readonly (string | number)[]): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail('Expected a positive safe integer.', path);
  }
  return value as number;
}

export function decodeProtocolInfo(value: unknown): ProtocolInfo {
  const input = record(value);
  exactKeys(input, ['protocol_version', 'package', 'capabilities', 'limits'], [
    'protocol_version',
    'package',
    'capabilities',
    'limits',
  ]);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      `Unsupported protocol version "${String(input.protocol_version)}".`,
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }

  const packageInfo = record(input.package, ['package']);
  exactKeys(packageInfo, ['name', 'version'], ['name', 'version'], ['package']);
  if (packageInfo.name !== SHARED_PACKAGE_NAME) {
    fail(`Expected package name "${SHARED_PACKAGE_NAME}".`, ['package', 'name']);
  }
  const packageVersion = boundedString(packageInfo.version, 5, 64, ['package', 'version']);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
    fail('Expected a semantic package version.', ['package', 'version']);
  }

  if (!Array.isArray(input.capabilities)) fail('Expected an array.', ['capabilities']);
  const capabilities = input.capabilities.map((capability, index) => {
    const decoded = boundedString(capability, 1, 64, ['capabilities', index]);
    if (!(KNOWN_CAPABILITIES as readonly string[]).includes(decoded)) {
      fail(`Unknown capability "${decoded}".`, ['capabilities', index]);
    }
    return decoded as Capability;
  });
  if (new Set(capabilities).size !== capabilities.length) {
    fail('Capabilities must be unique.', ['capabilities']);
  }

  const limits = record(input.limits, ['limits']);
  exactKeys(
    limits,
    [
      'max_request_bytes',
      'max_log_message_bytes',
      'max_read_page_size',
      'max_replay_page_size',
    ],
    [
      'max_request_bytes',
      'max_log_message_bytes',
      'max_read_page_size',
      'max_replay_page_size',
    ],
    ['limits'],
  );

  return {
    protocol_version: PROTOCOL_VERSION,
    package: { name: SHARED_PACKAGE_NAME, version: packageVersion },
    capabilities,
    limits: {
      max_request_bytes: positiveInteger(limits.max_request_bytes, ['limits', 'max_request_bytes']),
      max_log_message_bytes: positiveInteger(limits.max_log_message_bytes, ['limits', 'max_log_message_bytes']),
      max_read_page_size: positiveInteger(limits.max_read_page_size, ['limits', 'max_read_page_size']),
      max_replay_page_size: positiveInteger(limits.max_replay_page_size, ['limits', 'max_replay_page_size']),
    },
  };
}

export function negotiateProtocol(
  value: unknown,
  requiredCapabilities: readonly Capability[] = [],
): ProtocolInfo {
  const info = decodeProtocolInfo(value);
  const required = [...REQUIRED_SECURITY_CAPABILITIES, ...requiredCapabilities];
  for (const capability of new Set(required)) {
    if (!info.capabilities.includes(capability)) {
      throw new ProtocolContractError(
        `Required capability "${capability}" is unavailable.`,
        ErrorCode.UNSUPPORTED_CAPABILITY,
        ['capabilities'],
      );
    }
  }
  return info;
}

export function createProtocolEnvelope<T>(requestId: string, payload: T): ProtocolEnvelope<T> {
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(requestId)) {
    fail('Request id must be 8-128 URL-safe characters.', ['request_id']);
  }
  return { protocol_version: PROTOCOL_VERSION, request_id: requestId, payload };
}

export function decodeEnrollmentExchangeRequest(value: unknown): EnrollmentExchangeRequest {
  const input = record(value);
  exactKeys(input, ['invitation', 'client_name'], ['invitation']);
  const invitation = boundedString(input.invitation, 43, 1024, ['invitation']);
  const clientName = input.client_name === undefined
    ? undefined
    : boundedString(input.client_name, 1, 120, ['client_name']);
  if (clientName !== undefined && !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(clientName)) {
    fail('Client name contains unsupported characters.', ['client_name']);
  }
  return clientName === undefined ? { invitation } : { invitation, client_name: clientName };
}

export function decodeEnrollmentExchangeResponse(value: unknown): EnrollmentExchangeResponse {
  const input = record(value);
  exactKeys(
    input,
    ['client_id', 'credential', 'credential_expires_at'],
    ['client_id', 'credential'],
  );
  const clientId = boundedString(input.client_id, 8, 128, ['client_id']);
  const credential = boundedString(input.credential, 43, 1024, ['credential']);
  let expiresAt: string | null | undefined;
  if (input.credential_expires_at === null) expiresAt = null;
  else if (input.credential_expires_at !== undefined) {
    expiresAt = decodeCanonicalTimestamp(input.credential_expires_at, ['credential_expires_at']);
  }
  return expiresAt === undefined
    ? { client_id: clientId, credential }
    : { client_id: clientId, credential, credential_expires_at: expiresAt };
}

export function decodeCanonicalTimestamp(
  value: unknown,
  path: readonly (string | number)[] = [],
): string {
  const timestamp = boundedString(value, 24, 24, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)) {
    fail('Expected a canonical UTC timestamp with millisecond precision.', path);
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    fail('Expected a valid canonical UTC timestamp.', path);
  }
  return timestamp;
}

export function decodeLogCursor(value: unknown, path: readonly (string | number)[] = []): LogCursor {
  const input = record(value, path);
  exactKeys(input, ['id', 'created_at'], ['id', 'created_at'], path);
  return {
    id: boundedString(input.id, 1, 128, [...path, 'id']),
    created_at: decodeCanonicalTimestamp(input.created_at, [...path, 'created_at']),
  };
}

export function compareLogCursor(a: LogCursor, b: LogCursor): -1 | 0 | 1 {
  const left = decodeLogCursor(a);
  const right = decodeLogCursor(b);
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function maxLogCursor(a: LogCursor | null, b: LogCursor | null): LogCursor | null {
  if (a === null) return b === null ? null : decodeLogCursor(b);
  if (b === null) return decodeLogCursor(a);
  return compareLogCursor(a, b) >= 0 ? decodeLogCursor(a) : decodeLogCursor(b);
}
