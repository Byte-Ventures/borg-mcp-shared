import { ErrorCode } from './errors.js';
import { PROTOCOL_VERSION, type ProtocolVersion } from './version.js';

export const SHARED_PACKAGE_NAME = 'borgmcp-shared' as const;
export const SHARED_PACKAGE_VERSION = '0.5.0' as const;

export const HEALTH_PATH = '/healthz' as const;
export const PROTOCOL_INFO_PATH = '/api/protocol' as const;
export const ENROLLMENT_EXCHANGE_PATH = '/api/enrollment/exchange' as const;
export const CUBES_PATH = '/api/cubes' as const;

export const PROTOCOL_HTTP_CONTRACT = {
  health: { method: 'GET', path: HEALTH_PATH, authenticated: false, success_status: 204, bodyless: true },
  protocol: { method: 'GET', path: PROTOCOL_INFO_PATH, authenticated: false, success_status: 200 },
  enrollment: { method: 'POST', path: ENROLLMENT_EXCHANGE_PATH, authenticated: 'invitation', success_status: 201 },
  cubes: { method: 'POST', path: CUBES_PATH, authenticated: true, success_status: 201 },
  drone_reassign: {
    method: 'PATCH',
    path: '/api/cubes/:cubeId/drones/:droneId',
    authenticated: true,
    success_status: 200,
  },
  drone_evict: {
    method: 'DELETE',
    path: '/api/cubes/:cubeId/drones/:droneId',
    authenticated: true,
    success_status: 200,
  },
  auth_missing_status: 401,
  auth_invalid_status: 401,
  auth_expired_status: 401,
  session_revoked_status: 401,
  session_rejected_status: 401,
  cursor_expired_status: 410,
  drone_evicted_status: 410,
  content_too_large_status: 413,
  unsupported_protocol_status: 426,
  redirect_policy: 'error',
} as const;

export const PROTOCOL_LIMIT_CEILINGS = {
  max_request_bytes: 10 * 1024 * 1024,
  max_log_message_bytes: 1024 * 1024,
  max_read_page_size: 500,
  max_replay_page_size: 1000,
} as const;

/**
 * The credential-free protocol-tag preflight body. It carries ONLY the exact
 * protocol tag — no package version, limits, server identity, or other
 * fingerprint surface — so a client can verify pinned TLS and the exact tag
 * before it creates or sends any credential.
 */
export interface ProtocolTagPreflight {
  protocol_version: ProtocolVersion;
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
  };
}

/** All secret values are generated and persisted pending by the client before send. */
export interface EnrollmentExchangeRequest {
  invitation: string;
  retry_key: string;
  client_credential: string;
  client_name?: string;
}

export const SERVER_CAPABILITIES = ['create_cube'] as const;
export type ServerCapability = (typeof SERVER_CAPABILITIES)[number];

/** Ordinary enrollment creates an ungranted client and never returns a bearer. */
export interface ClientEnrollmentExchangeResponse {
  purpose: 'client';
  client_id: string;
  server_capabilities: [];
}

/** Owner enrollment grants only the narrow authority to create cubes. */
export interface OwnerEnrollmentExchangeResponse {
  purpose: 'owner';
  client_id: string;
  server_capabilities: ['create_cube'];
}

export type EnrollmentExchangeResponse =
  | ClientEnrollmentExchangeResponse
  | OwnerEnrollmentExchangeResponse;

export const CUBE_TEMPLATES = ['default'] as const;
export type CubeTemplate = (typeof CUBE_TEMPLATES)[number];

export interface CreateCubeRequest {
  retry_key: string;
  name: string;
  template: CubeTemplate;
}

export interface CreateCubeResponse {
  cube_id: string;
  human_seat_role_id: string;
  default_worker_role_id: string;
  access: 'manage';
}

export interface AckLogRequest {
  entry_id: string;
  kind: 'ack' | 'claim';
}

export type RemoveDecisionRequest =
  | { topic: string }
  | { decision_id: string };

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
  if (typeof value !== 'string') fail('Expected a string.', path);
  const bytes = utf8ByteLength(value);
  if (bytes < min || bytes > max) {
    fail(`Expected a string between ${min} and ${max} UTF-8 bytes.`, path);
  }
  return value;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
             value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

function boundedPositiveInteger(
  value: unknown,
  maximum: number,
  path: readonly (string | number)[],
): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    fail(`Expected a positive safe integer no greater than ${maximum}.`, path);
  }
  return value as number;
}

function opaqueIdentifier(value: unknown, path: readonly (string | number)[]): string {
  const identifier = boundedString(value, 1, 128, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(identifier)) {
    fail('Expected a URL-safe opaque identifier.', path);
  }
  return identifier;
}

function opaqueToken(value: unknown, path: readonly (string | number)[]): string {
  const token = boundedString(value, 43, 1024, path);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    fail('Expected an unpadded base64url token.', path);
  }
  return token;
}

function decodeRequestId(value: unknown, path: readonly (string | number)[]): string {
  const decoded = boundedString(value, 8, 128, path);
  if (!/^[A-Za-z0-9._-]+$/.test(decoded)) {
    fail('Request id contains unsupported characters.', path);
  }
  return decoded;
}

/**
 * Emit the credential-free protocol-tag preflight body. Servers return exactly
 * this — the tag and nothing else — from the unauthenticated `GET /api/protocol`.
 */
export function createProtocolTagPreflight(): ProtocolTagPreflight {
  return { protocol_version: PROTOCOL_VERSION };
}

/**
 * Decode the credential-free, mutation-free protocol-tag preflight. The body must
 * be exactly `{ protocol_version }` and carry the exact expected tag; any other
 * tag, an extra field, or a non-object fails closed before any credential is
 * created or sent. This is the sole acceptance authority — there is no
 * negotiation, capability list, or package/limit surface to inspect.
 */
export function decodeProtocolTagPreflight(value: unknown): ProtocolTagPreflight {
  const input = record(value);
  exactKeys(input, ['protocol_version'], ['protocol_version']);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      'Unsupported protocol version.',
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }
  return { protocol_version: PROTOCOL_VERSION };
}

export function createProtocolEnvelope<T>(requestId: string, payload: T): ProtocolEnvelope<T> {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: decodeRequestId(requestId, ['request_id']),
    payload,
  };
}

export function decodeProtocolEnvelope<T>(
  value: unknown,
  decodePayload: (payload: unknown) => T,
): ProtocolEnvelope<T> {
  const input = record(value);
  exactKeys(input, ['protocol_version', 'request_id', 'payload'], [
    'protocol_version',
    'request_id',
    'payload',
  ]);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      'Unsupported protocol version.',
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }
  const decodedRequestId = decodeRequestId(input.request_id, ['request_id']);
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: decodedRequestId,
    payload: decodePayload(input.payload),
  };
}


export function decodeProtocolErrorEnvelope(value: unknown): ProtocolErrorEnvelope {
  const input = record(value);
  exactKeys(input, ['protocol_version', 'request_id', 'error'], ['protocol_version', 'error']);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      'Unsupported protocol version.',
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }
  const error = record(input.error, ['error']);
  exactKeys(
    error,
    [
      'code',
      'message',
      'details',
      'retry_after',
    ],
    ['code', 'message'],
    ['error'],
  );
  if (typeof error.code !== 'string' || !Object.values(ErrorCode).includes(error.code as ErrorCode)) {
    fail('Unknown protocol error code.', ['error', 'code']);
  }
  const decodedError: ProtocolErrorEnvelope['error'] = {
    code: error.code as ErrorCode,
    message: redactProtocolDiagnostic(
      boundedString(error.message, 1, 512, ['error', 'message']),
    ),
  };
  if (error.details !== undefined) {
    decodedError.details = redactProtocolDiagnostic(
      boundedString(error.details, 1, 2048, ['error', 'details']),
    );
  }
  if (error.retry_after !== undefined) {
    decodedError.retry_after = boundedPositiveInteger(error.retry_after, 86_400, ['error', 'retry_after']);
  }
  const decodedRequestId = input.request_id === undefined
    ? undefined
    : decodeRequestId(input.request_id, ['request_id']);
  return decodedRequestId === undefined
    ? { protocol_version: PROTOCOL_VERSION, error: decodedError }
    : { protocol_version: PROTOCOL_VERSION, request_id: decodedRequestId, error: decodedError };
}

export function decodeEnrollmentExchangeRequest(value: unknown): EnrollmentExchangeRequest {
  const input = record(value);
  exactKeys(
    input,
    ['invitation', 'retry_key', 'client_credential', 'client_name'],
    ['invitation', 'retry_key', 'client_credential'],
  );
  const invitation = opaqueToken(input.invitation, ['invitation']);
  const retryKey = decodeUuid(input.retry_key, ['retry_key']);
  const clientCredential = decodeEnrollmentClientCredential(
    input.client_credential,
    ['client_credential'],
  );
  const clientName = input.client_name === undefined
    ? undefined
    : boundedString(input.client_name, 1, 120, ['client_name']);
  if (clientName !== undefined && !/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(clientName)) {
    fail('Client name contains unsupported characters.', ['client_name']);
  }
  const request = {
    invitation,
    retry_key: retryKey,
    client_credential: clientCredential,
  };
  return clientName === undefined ? request : { ...request, client_name: clientName };
}

export function decodeEnrollmentExchangeRequestEnvelope(
  value: unknown,
): ProtocolEnvelope<EnrollmentExchangeRequest> {
  return decodeProtocolEnvelope(value, decodeEnrollmentExchangeRequest);
}

export function decodeEnrollmentExchangeResponse(value: unknown): EnrollmentExchangeResponse {
  const input = record(value);
  if (input.purpose === 'client') {
    exactKeys(input, ['purpose', 'client_id', 'server_capabilities'], ['purpose', 'client_id', 'server_capabilities']);
    decodeExactServerCapabilities(input.server_capabilities, [], ['server_capabilities']);
    return {
      purpose: 'client',
      client_id: decodeUuid(input.client_id, ['client_id']),
      server_capabilities: [],
    };
  }
  if (input.purpose !== 'owner') fail('Invalid enrollment purpose.', ['purpose']);
  exactKeys(input, ['purpose', 'client_id', 'server_capabilities'], ['purpose', 'client_id', 'server_capabilities']);
  decodeExactServerCapabilities(input.server_capabilities, ['create_cube'], ['server_capabilities']);
  return {
    purpose: 'owner',
    client_id: decodeUuid(input.client_id, ['client_id']),
    server_capabilities: ['create_cube'],
  };
}

export function decodeEnrollmentExchangeResponseEnvelope(
  value: unknown,
): ProtocolEnvelope<EnrollmentExchangeResponse> {
  return decodeProtocolEnvelope(value, decodeEnrollmentExchangeResponse);
}

function decodeExactServerCapabilities(
  value: unknown,
  expected: readonly ServerCapability[],
  path: readonly (string | number)[],
): void {
  if (!Array.isArray(value) || value.length !== expected.length ||
      value.some((capability, index) => capability !== expected[index])) {
    fail(`Expected server capabilities [${expected.join(', ')}].`, path);
  }
}

export function decodeCreateCubeRequest(value: unknown): CreateCubeRequest {
  const input = record(value);
  exactKeys(input, ['retry_key', 'name', 'template'], ['retry_key', 'name', 'template']);
  const name = boundedString(input.name, 1, 120, ['name']);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
    fail('Cube name contains unsupported characters.', ['name']);
  }
  if (!CUBE_TEMPLATES.includes(input.template as CubeTemplate)) {
    fail('Unsupported cube template.', ['template']);
  }
  return {
    retry_key: decodeUuid(input.retry_key, ['retry_key']),
    name,
    template: input.template as CubeTemplate,
  };
}

export function decodeCreateCubeRequestEnvelope(value: unknown): ProtocolEnvelope<CreateCubeRequest> {
  return decodeProtocolEnvelope(value, decodeCreateCubeRequest);
}

export function decodeCreateCubeResponse(value: unknown): CreateCubeResponse {
  const input = record(value);
  exactKeys(
    input,
    ['cube_id', 'human_seat_role_id', 'default_worker_role_id', 'access'],
    ['cube_id', 'human_seat_role_id', 'default_worker_role_id', 'access'],
  );
  if (input.access !== 'manage') fail('Created cube access must be manage.', ['access']);
  return {
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    human_seat_role_id: decodeUuid(input.human_seat_role_id, ['human_seat_role_id']),
    default_worker_role_id: decodeUuid(input.default_worker_role_id, ['default_worker_role_id']),
    access: 'manage',
  };
}

export function decodeCreateCubeResponseEnvelope(value: unknown): ProtocolEnvelope<CreateCubeResponse> {
  return decodeProtocolEnvelope(value, decodeCreateCubeResponse);
}

export function decodeAppendLogRequest(value: unknown): import('./types.js').AppendLogRequest {
  const input = record(value);
  exactKeys(
    input,
    ['message', 'visibility', 'recipientDroneIds', 'class', 'to'],
    ['message'],
  );
  const output: import('./types.js').AppendLogRequest = {
    message: boundedString(input.message, 1, 10_240, ['message']),
  };
  if (input.visibility !== undefined) {
    if (input.visibility !== 'broadcast' && input.visibility !== 'direct') {
      fail('Invalid log visibility.', ['visibility']);
    }
    output.visibility = input.visibility;
  }
  if (input.recipientDroneIds !== undefined) {
    if (!Array.isArray(input.recipientDroneIds) || input.recipientDroneIds.length === 0 || input.recipientDroneIds.length > 100) {
      fail('Expected recipientDroneIds to contain 1-100 UUIDs.', ['recipientDroneIds']);
    }
    output.recipientDroneIds = input.recipientDroneIds.map((id, index) =>
      decodeUuid(id, ['recipientDroneIds', index])
    );
  }
  if (input.class !== undefined) {
    output.class = boundedString(input.class, 1, 64, ['class']);
  }
  if (input.to !== undefined) {
    output.to = decodeStringArray(input.to, 'to', 100, 120);
  }
  return output;
}

function decodeStringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    fail(`Expected ${field} to contain 1-${maxItems} values.`, [field]);
  }
  const decoded = value.map((item, index) => boundedString(item, 1, maxLength, [field, index]));
  if (new Set(decoded).size !== decoded.length) fail(`${field} values must be unique.`, [field]);
  return decoded;
}

export function decodeAckLogRequest(value: unknown): AckLogRequest {
  const input = record(value);
  exactKeys(input, ['entry_id', 'kind'], ['entry_id']);
  const kind = input.kind ?? 'ack';
  if (kind !== 'ack' && kind !== 'claim') fail('Invalid ack kind.', ['kind']);
  return {
    entry_id: decodeUuid(input.entry_id, ['entry_id']),
    kind,
  };
}

export function decodeRecordDecisionRequest(
  value: unknown,
): import('./types.js').RecordDecisionRequest {
  const input = record(value);
  exactKeys(input, ['topic', 'decision', 'rationale'], ['topic', 'decision']);
  const output: import('./types.js').RecordDecisionRequest = {
    topic: boundedString(input.topic, 1, 120, ['topic']),
    decision: boundedString(input.decision, 1, 2000, ['decision']),
  };
  if (input.rationale !== undefined) {
    output.rationale = boundedString(input.rationale, 1, 2000, ['rationale']);
  }
  return output;
}

export function decodeRemoveDecisionRequest(value: unknown): RemoveDecisionRequest {
  const input = record(value);
  exactKeys(input, ['topic', 'decision_id'], []);
  const hasTopic = input.topic !== undefined;
  const hasId = input.decision_id !== undefined;
  if (hasTopic === hasId) fail('Exactly one decision selector is required.');
  return hasTopic
    ? { topic: boundedString(input.topic, 1, 120, ['topic']) }
    : { decision_id: decodeUuid(input.decision_id, ['decision_id']) };
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
    id: decodeUuid(input.id, [...path, 'id']),
    created_at: decodeCanonicalTimestamp(input.created_at, [...path, 'created_at']),
  };
}

export function decodeUuid(value: unknown, path: readonly (string | number)[] = []): string {
  const id = boundedString(value, 36, 36, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    fail('Expected a canonical UUID.', path);
  }
  return id.toLowerCase();
}

export function decodeEnrollmentClientCredential(
  value: unknown,
  path: readonly (string | number)[] = [],
): string {
  const credential = boundedString(value, 43, 43, path);
  if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(credential)) {
    fail('Expected an unpadded base64url encoding of exactly 256 bits.', path);
  }
  return credential;
}

export function decodeOpaqueIdentifier(
  value: unknown,
  path: readonly (string | number)[] = [],
): string {
  return opaqueIdentifier(value, path);
}

export function redactProtocolDiagnostic(value: string): string {
  return value
    .replace(/(\bretry[_-]?key\b["']?\s*(?:=|:)\s*["']?)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '$1<REDACTED>')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    )
    .replace(/\bBearer\s+[A-Za-z0-9_-]{20,}/gi, 'Bearer <REDACTED>')
    .replace(/[A-Za-z0-9_-]{43,}/g, '<REDACTED>');
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

// ── v2 clean-slate wire types ──────────────────────────────────────────────

export const ATTACH_PATH = '/api/client/attach' as const;

export interface AttachRequest {
  cube_id: string;
  role_id: string;
  session_credential: string;
  prior_drone_id?: string;
}

export interface AttachCube {
  id: string;
  name: string;
}

export type AttachRoleClass = 'queen' | 'worker';

export interface AttachRole {
  id: string;
  name: string;
  role_class?: AttachRoleClass;
  is_human_seat?: boolean;
}

export interface AttachDrone {
  id: string;
  label: string;
}

export interface AttachSession {
  id: string;
}

export interface AttachResponse {
  result: 'created' | 'reused';
  cube: AttachCube;
  role: AttachRole;
  drone: AttachDrone;
  session: AttachSession;
}

function decodeAttachCube(value: unknown, path: readonly (string | number)[]): AttachCube {
  const input = record(value, path);
  exactKeys(input, ['id', 'name'], ['id', 'name'], path);
  return {
    id: decodeUuid(input.id, [...path, 'id']),
    name: boundedString(input.name, 1, 128, [...path, 'name']),
  };
}

function decodeAttachRole(value: unknown, path: readonly (string | number)[]): AttachRole {
  const input = record(value, path);
  exactKeys(input, ['id', 'name', 'role_class', 'is_human_seat'], ['id', 'name'], path);
  const result: AttachRole = {
    id: decodeUuid(input.id, [...path, 'id']),
    name: boundedString(input.name, 1, 128, [...path, 'name']),
  };
  if (input.role_class !== undefined) {
    if (input.role_class !== 'queen' && input.role_class !== 'worker') {
      fail('Expected role_class "queen" or "worker".', [...path, 'role_class']);
    }
    result.role_class = input.role_class;
  }
  if (input.is_human_seat !== undefined) {
    if (typeof input.is_human_seat !== 'boolean') {
      fail('Expected a boolean.', [...path, 'is_human_seat']);
    }
    result.is_human_seat = input.is_human_seat;
  }
  return result;
}

function decodeAttachDrone(value: unknown, path: readonly (string | number)[]): AttachDrone {
  const input = record(value, path);
  exactKeys(input, ['id', 'label'], ['id', 'label'], path);
  return {
    id: decodeUuid(input.id, [...path, 'id']),
    label: boundedString(input.label, 1, 128, [...path, 'label']),
  };
}

function decodeAttachSession(value: unknown, path: readonly (string | number)[]): AttachSession {
  const input = record(value, path);
  exactKeys(input, ['id'], ['id'], path);
  return {
    id: decodeUuid(input.id, [...path, 'id']),
  };
}

/**
 * Decode a v2 attach request. Strict: exact keys, bounded sizes,
 * session_credential is token-safe and never echoed in errors.
 */
export function decodeAttachRequest(value: unknown): AttachRequest {
  const input = record(value);
  exactKeys(input, ['cube_id', 'role_id', 'session_credential', 'prior_drone_id'], [
    'cube_id',
    'role_id',
    'session_credential',
  ]);
  const result: AttachRequest = {
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    role_id: decodeUuid(input.role_id, ['role_id']),
    session_credential: opaqueToken(input.session_credential, ['session_credential']),
  };
  if (input.prior_drone_id !== undefined) {
    result.prior_drone_id = decodeUuid(input.prior_drone_id, ['prior_drone_id']);
  }
  return result;
}

/**
 * Create a v2 attach request envelope. Stamps the canonical protocol version.
 */
export function createAttachRequestEnvelope(
  requestId: string,
  payload: AttachRequest,
): ProtocolEnvelope<AttachRequest> {
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: decodeRequestId(requestId, ['request_id']),
    payload,
  };
}

/**
 * Decode a v2 attach request envelope. Verifies protocol_version === PROTOCOL_VERSION
 * BEFORE decoding the payload — a wrong tag never invokes the payload decoder
 * and never exposes or returns the supplied session_credential.
 * Uses a static token-safe diagnostic; does not interpolate attacker-controlled text.
 */
export function decodeAttachRequestEnvelope(
  value: unknown,
): ProtocolEnvelope<AttachRequest> {
  const input = record(value);
  exactKeys(input, ['protocol_version', 'request_id', 'payload'], [
    'protocol_version',
    'request_id',
    'payload',
  ]);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      'Unsupported protocol version.',
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }
  const decodedRequestId = decodeRequestId(input.request_id, ['request_id']);
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: decodedRequestId,
    payload: decodeAttachRequest(input.payload),
  };
}

/**
 * Decode a v2 attach response. Strict: exact keys and result discriminant.
 */
export function decodeAttachResponse(value: unknown): AttachResponse {
  const input = record(value);
  exactKeys(input, ['result', 'cube', 'role', 'drone', 'session'], [
    'result',
    'cube',
    'role',
    'drone',
    'session',
  ]);
  if (input.result !== 'created' && input.result !== 'reused') {
    fail('Expected result "created" or "reused".', ['result']);
  }
  return {
    result: input.result,
    cube: decodeAttachCube(input.cube, ['cube']),
    role: decodeAttachRole(input.role, ['role']),
    drone: decodeAttachDrone(input.drone, ['drone']),
    session: decodeAttachSession(input.session, ['session']),
  };
}

/**
 * Decode a v2 attach response wrapped in a ProtocolEnvelope.
 * Verifies protocol_version === PROTOCOL_VERSION before decoding payload.
 */
export function decodeAttachResponseEnvelope(value: unknown): ProtocolEnvelope<AttachResponse> {
  const input = record(value);
  exactKeys(input, ['protocol_version', 'request_id', 'payload'], [
    'protocol_version',
    'request_id',
    'payload',
  ]);
  if (input.protocol_version !== PROTOCOL_VERSION) {
    throw new ProtocolContractError(
      'Unsupported protocol version.',
      ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
      ['protocol_version'],
    );
  }
  const decodedRequestId = decodeRequestId(input.request_id, ['request_id']);
  return {
    protocol_version: PROTOCOL_VERSION,
    request_id: decodedRequestId,
    payload: decodeAttachResponse(input.payload),
  };
}
