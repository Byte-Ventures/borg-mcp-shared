import { ErrorCode } from './errors.js';
import { PROTOCOL_VERSION, type ProtocolVersion } from './version.js';
import {
  canonicalizeRepositoryIdentity,
  RuntimeMetadataValidationError,
  validateRuntimeMetadata,
  validateRuntimeMetadataPatch,
  validateRuntimeMetadataReportState,
} from '../runtime-metadata.js';
import type {
  DroneRuntimeMetadata,
  DroneRuntimeMetadataPatch,
} from './types.js';

export const SHARED_PACKAGE_NAME = 'borgmcp-shared' as const;
export const SHARED_PACKAGE_VERSION = '0.15.0' as const;
/** Maximum UTF-8 payload for each newly recorded decision text field. */
export const DECISION_TEXT_MAX_BYTES = 512 as const;
/** Maximum UTF-8 size of role detailed-description text and any returned section slice. */
export const ROLE_TEXT_MAX_BYTES = 51_200 as const;
export const DEFAULT_LOG_ENTRY_ADVISORY_BYTES = 1024 as const;
export const DEFAULT_MAX_LOG_ENTRY_BYTES = 4096 as const;
export const LOG_ENTRY_ADVISORY_ENV = 'BORG_SERVER_LOG_ENTRY_ADVISORY_BYTES' as const;
export const MAX_LOG_ENTRY_ENV = 'BORG_SERVER_MAX_LOG_ENTRY_BYTES' as const;

export const HEALTH_PATH = '/healthz' as const;
export const PROTOCOL_INFO_PATH = '/api/protocol' as const;
export const ENROLLMENT_EXCHANGE_PATH = '/api/enrollment/exchange' as const;
export const CUBES_PATH = '/api/cubes' as const;
export const CUBE_PATH = '/api/cubes/:cubeId' as const;
export const ROLE_PATH = '/api/cubes/:cubeId/roles/:roleId' as const;
export const ROLE_RATIONALE_PATH = '/api/cubes/:cubeId/role-rationale' as const;
export const REPOSITORY_CUBE_RESOLVE_PATH = '/api/repository-cubes/resolve' as const;
export const REPOSITORY_CUBE_ASSOCIATION_PATH = '/api/repository-cubes/association' as const;
export const ATTACH_PATH = '/api/client/attach' as const;
export const SELF_RUNTIME_METADATA_PATH = '/api/cubes/:cubeId/drones/self/metadata' as const;
export const DOCUMENTS_PATH = '/api/cubes/:cubeId/documents' as const;
export const DOCUMENT_PATH = '/api/cubes/:cubeId/documents/:documentId' as const;

export const PROTOCOL_HTTP_CONTRACT = {
  health: { method: 'GET', path: HEALTH_PATH, authenticated: false, success_status: 204, bodyless: true },
  protocol: { method: 'GET', path: PROTOCOL_INFO_PATH, authenticated: false, success_status: 200 },
  enrollment: { method: 'POST', path: ENROLLMENT_EXCHANGE_PATH, authenticated: 'invitation', success_status: 201 },
  cubes: { method: 'POST', path: CUBES_PATH, authenticated: true, success_status: 201 },
  document_put: { method: 'PUT', path: DOCUMENTS_PATH, authenticated: true, success_status: 201, mutation: true },
  document_list: { method: 'GET', path: DOCUMENTS_PATH, authenticated: true, success_status: 200, mutation: false },
  document_get: { method: 'GET', path: DOCUMENT_PATH, authenticated: true, success_status: 200, mutation: false },
  document_remove: { method: 'DELETE', path: DOCUMENT_PATH, authenticated: true, success_status: 200, mutation: true },
  cube_delete: {
    method: 'DELETE',
    path: CUBE_PATH,
    authenticated: true,
    success_status: 200,
    mutation: true,
  },
  role_delete: {
    method: 'DELETE',
    path: ROLE_PATH,
    authenticated: true,
    success_status: 200,
    mutation: true,
  },
  role_rationale: {
    method: 'POST',
    path: ROLE_RATIONALE_PATH,
    authenticated: true,
    success_status: 200,
    mutation: false,
  },
  repository_cube_resolve: {
    method: 'POST',
    path: REPOSITORY_CUBE_RESOLVE_PATH,
    authenticated: true,
    success_status: 200,
    mutation: false,
  },
  repository_cube_association: {
    method: 'PUT',
    path: REPOSITORY_CUBE_ASSOCIATION_PATH,
    authenticated: true,
    success_status: 200,
    mutation: true,
  },
  attach: { method: 'POST', path: ATTACH_PATH, authenticated: true, success_status: 200 },
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
  drone_self_metadata: {
    method: 'PATCH',
    path: SELF_RUNTIME_METADATA_PATH,
    authenticated: 'drone-session',
    success_status: 200,
  },
  auth_missing_status: 401,
  auth_invalid_status: 401,
  session_revoked_status: 401,
  session_rejected_status: 401,
  cursor_expired_status: 410,
  cube_deleted_status: 410,
  drone_evicted_status: 410,
  content_too_large_status: 413,
  unsupported_protocol_status: 426,
  redirect_policy: 'error',
} as const;

export const PROTOCOL_LIMIT_CEILINGS = {
  max_request_bytes: 10 * 1024 * 1024,
  max_log_message_bytes: 65_536,
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

export const INVITATION_ARTIFACT_VERSION = 2 as const;
export type InvitationAuthority = 'client' | 'owner';

/**
 * The single opaque value transported between machines for enrollment. The
 * integrity field is produced and verified by the issuing implementation; the
 * shared codec preserves it as a bounded canonical field.
 */
export interface InvitationArtifact {
  version: typeof INVITATION_ARTIFACT_VERSION;
  endpoint: string;
  ca_spki_sha256: string;
  authority: InvitationAuthority;
  secret: string;
  integrity: string;
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

export const CUBE_TEMPLATES = ['default', 'software-dev', 'starter', 'local-model'] as const;
export type CubeTemplate = (typeof CUBE_TEMPLATES)[number];

export type CreateCubeRepository =
  | { kind: 'origin'; value: string }
  | { kind: 'local'; value: string };

export interface CreateCubeRequest {
  retry_key: string;
  name: string;
  working_repo_name: string;
  repository: CreateCubeRepository;
  template: CubeTemplate;
}

export interface CreateCubeResponse {
  result: 'created' | 'resolved';
  cube_id: string;
  name: string;
  working_repo_name: string;
  repository: CreateCubeRepository;
  template: CubeTemplate;
  human_seat_role_id: string;
  default_worker_role_id: string;
  access: 'manage';
}

export type DeleteCubeRequest = Record<string, never>;

export interface DeleteCubeResponse {
  cube_id: string;
  deleted: true;
}

export interface ResolveRepositoryCubeRequest {
  working_repo_name: string;
  repository: CreateCubeRepository;
}

export interface AssociateRepositoryCubeRequest extends ResolveRepositoryCubeRequest {
  cube_id: string;
}

export interface ResolvedRepositoryCube {
  result: 'resolved';
  cube_id: string;
  name: string;
  working_repo_name: string;
  repository: CreateCubeRepository;
  template: CubeTemplate;
  human_seat_role_id: string;
  default_worker_role_id: string;
  access: 'manage';
}

export type ResolveRepositoryCubeResponse =
  | { result: 'none' }
  | ResolvedRepositoryCube;

export type AssociateRepositoryCubeResponse = ResolvedRepositoryCube;

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

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INVITATION_MAGIC = 'B2';
const INVITATION_LENGTH_HEX_DIGITS = 3;

function encodeBase64UrlAscii(value: string): string {
  let output = '';
  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index);
    const hasSecond = index + 1 < value.length;
    const hasThird = index + 2 < value.length;
    const second = hasSecond ? value.charCodeAt(index + 1) : 0;
    const third = hasThird ? value.charCodeAt(index + 2) : 0;
    output += BASE64URL_ALPHABET[first >> 2];
    output += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    if (hasSecond) output += BASE64URL_ALPHABET[((second & 0x0f) << 2) | (third >> 6)];
    if (hasThird) output += BASE64URL_ALPHABET[third & 0x3f];
  }
  return output;
}

function decodeBase64UrlAscii(value: string, path: readonly (string | number)[]): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    fail('Expected an unpadded base64url value.', path);
  }
  let output = '';
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64URL_ALPHABET.indexOf(value[index]);
    const second = BASE64URL_ALPHABET.indexOf(value[index + 1]);
    const third = index + 2 < value.length ? BASE64URL_ALPHABET.indexOf(value[index + 2]) : 0;
    const fourth = index + 3 < value.length ? BASE64URL_ALPHABET.indexOf(value[index + 3]) : 0;
    if (first < 0 || second < 0 || (index + 2 < value.length && third < 0) ||
        (index + 3 < value.length && fourth < 0)) {
      fail('Expected an unpadded base64url value.', path);
    }
    const bytes = [
      (first << 2) | (second >> 4),
      ((second & 0x0f) << 4) | (third >> 2),
      ((third & 0x03) << 6) | fourth,
    ];
    const byteCount = Math.min(3, value.length - index - 1);
    for (let byteIndex = 0; byteIndex < byteCount; byteIndex++) {
      if (bytes[byteIndex] > 0x7f) fail('Invitation fields must contain ASCII bytes.', path);
      output += String.fromCharCode(bytes[byteIndex]);
    }
  }
  if (encodeBase64UrlAscii(output) !== value) {
    fail('Expected canonical unpadded base64url encoding.', path);
  }
  return output;
}

function encodedBase64UrlLength(byteLength: number): number {
  const remainder = byteLength % 3;
  return Math.floor(byteLength / 3) * 4 + (remainder === 0 ? 0 : remainder + 1);
}

function invitationFieldLength(value: string, path: readonly (string | number)[]): string {
  const length = value.length;
  if (length > 0xfff) fail('Invitation field is too long.', path);
  return length.toString(16).padStart(INVITATION_LENGTH_HEX_DIGITS, '0');
}

function decodeInvitationField(
  payload: string,
  cursor: { value: number },
  path: readonly (string | number)[],
): string {
  const lengthText = payload.slice(cursor.value, cursor.value + INVITATION_LENGTH_HEX_DIGITS);
  if (!/^[0-9a-f]{3}$/.test(lengthText)) fail('Invitation field length is invalid.', path);
  cursor.value += INVITATION_LENGTH_HEX_DIGITS;
  const byteLength = Number.parseInt(lengthText, 16);
  const encodedLength = encodedBase64UrlLength(byteLength);
  const encoded = payload.slice(cursor.value, cursor.value + encodedLength);
  if (encoded.length !== encodedLength) fail('Invitation field is truncated.', path);
  cursor.value += encodedLength;
  const decoded = decodeBase64UrlAscii(encoded, path);
  if (decoded.length !== byteLength) fail('Invitation field length does not match its value.', path);
  return decoded;
}

function canonicalInvitationEndpoint(value: unknown, path: readonly (string | number)[]): string {
  const endpoint = boundedString(value, 1, 512, path);
  type ParsedUrl = {
    protocol: string;
    origin: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    username: string;
    password: string;
  };
  const UrlParser = (globalThis as unknown as { URL?: new (value: string) => ParsedUrl }).URL;
  if (UrlParser === undefined) fail('Invitation endpoint URL parsing is unavailable.', path);
  let parsed: ParsedUrl;
  try {
    parsed = new UrlParser(endpoint);
  } catch {
    fail('Invitation endpoint must be a valid URL.', path);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash || endpoint !== parsed.origin ||
      (parsed.port !== '' && (Number.parseInt(parsed.port, 10) < 1 || Number.parseInt(parsed.port, 10) > 65_535))) {
    fail('Invitation endpoint must be a canonical HTTPS origin.', path);
  }
  return endpoint;
}

function validateInvitationArtifact(value: unknown): InvitationArtifact {
  const input = record(value);
  exactKeys(input, ['version', 'endpoint', 'ca_spki_sha256', 'authority', 'secret', 'integrity'], [
    'version',
    'endpoint',
    'ca_spki_sha256',
    'authority',
    'secret',
    'integrity',
  ]);
  if (input.version !== INVITATION_ARTIFACT_VERSION) {
    fail('Unsupported invitation artifact version.', ['version']);
  }
  const endpoint = canonicalInvitationEndpoint(input.endpoint, ['endpoint']);
  const caSpkiSha256 = boundedString(input.ca_spki_sha256, 64, 64, ['ca_spki_sha256']);
  if (!/^[0-9a-f]{64}$/.test(caSpkiSha256)) {
    fail('CA SPKI SHA-256 must be lowercase hexadecimal.', ['ca_spki_sha256']);
  }
  if (input.authority !== 'client' && input.authority !== 'owner') {
    fail('Invitation authority is invalid.', ['authority']);
  }
  return {
    version: INVITATION_ARTIFACT_VERSION,
    endpoint,
    ca_spki_sha256: caSpkiSha256,
    authority: input.authority,
    secret: opaqueToken(input.secret, ['secret']),
    integrity: opaqueToken(input.integrity, ['integrity']),
  };
}

/**
 * Return the canonical ASCII preimage for the artifact integrity binding.
 * Implementations hash these exact bytes with their agreed secret algorithm;
 * the shared package intentionally does not own a crypto runtime.
 */
export function getInvitationArtifactIntegrityInput(value: InvitationArtifact): string {
  const artifact = validateInvitationArtifact(value);
  const endpoint = encodeBase64UrlAscii(artifact.endpoint);
  const secret = encodeBase64UrlAscii(artifact.secret);
  return [
    INVITATION_MAGIC,
    invitationFieldLength(artifact.endpoint, ['endpoint']),
    endpoint,
    artifact.ca_spki_sha256,
    artifact.authority === 'client' ? 'c' : 'o',
    invitationFieldLength(artifact.secret, ['secret']),
    secret,
  ].join('');
}

/** Encode an invitation artifact as one canonical, unpadded base64url token. */
export function encodeInvitationArtifact(value: InvitationArtifact): string {
  const artifact = validateInvitationArtifact(value);
  const payload = [
    getInvitationArtifactIntegrityInput(artifact),
    invitationFieldLength(artifact.integrity, ['integrity']),
    encodeBase64UrlAscii(artifact.integrity),
  ].join('');
  const token = encodeBase64UrlAscii(payload);
  if (token.length < 43 || token.length > 1024) {
    fail('Encoded invitation artifact exceeds the supported token bound.');
  }
  return token;
}

/** Decode and strictly validate a canonical invitation artifact token. */
export function decodeInvitationArtifact(value: unknown): InvitationArtifact {
  const token = opaqueToken(value, ['invitation']);
  const payload = decodeBase64UrlAscii(token, ['invitation']);
  if (!payload.startsWith(INVITATION_MAGIC)) {
    fail('Invitation uses an unsupported or legacy format.', ['invitation']);
  }
  const cursor = { value: INVITATION_MAGIC.length };
  const endpoint = decodeInvitationField(payload, cursor, ['endpoint']);
  const caSpkiSha256 = payload.slice(cursor.value, cursor.value + 64);
  if (caSpkiSha256.length !== 64) fail('Invitation pin is truncated.', ['ca_spki_sha256']);
  cursor.value += 64;
  const authority = payload[cursor.value++];
  const secret = decodeInvitationField(payload, cursor, ['secret']);
  const integrity = decodeInvitationField(payload, cursor, ['integrity']);
  if (cursor.value !== payload.length) fail('Invitation contains trailing fields.', ['invitation']);
  return validateInvitationArtifact({
    version: INVITATION_ARTIFACT_VERSION,
    endpoint,
    ca_spki_sha256: caSpkiSha256,
    authority: authority === 'c' ? 'client' : authority === 'o' ? 'owner' : authority,
    secret,
    integrity,
  });
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
      'This client requires protocol v12. The peer presents a different version. Update `borgmcp-server` and `borgmcp` to matching releases — server first, then client.',
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
  exactKeys(
    input,
    ['retry_key', 'name', 'working_repo_name', 'repository', 'template'],
    ['retry_key', 'name', 'working_repo_name', 'repository', 'template'],
  );
  const name = boundedString(input.name, 1, 120, ['name']);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
    fail('Cube name contains unsupported characters.', ['name']);
  }
  const workingRepoName = decodeWorkingRepositoryName(input.working_repo_name, ['working_repo_name']);
  if (!CUBE_TEMPLATES.includes(input.template as CubeTemplate)) {
    fail('Unsupported cube template.', ['template']);
  }
  return {
    retry_key: decodeUuid(input.retry_key, ['retry_key']),
    name,
    working_repo_name: workingRepoName,
    repository: decodeCreateCubeRepository(input.repository, ['repository']),
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
    [
      'result',
      'cube_id',
      'name',
      'working_repo_name',
      'repository',
      'template',
      'human_seat_role_id',
      'default_worker_role_id',
      'access',
    ],
    [
      'result',
      'cube_id',
      'name',
      'working_repo_name',
      'repository',
      'template',
      'human_seat_role_id',
      'default_worker_role_id',
      'access',
    ],
  );
  if (input.result !== 'created' && input.result !== 'resolved') {
    fail('Invalid cube creation result.', ['result']);
  }
  const name = boundedString(input.name, 1, 120, ['name']);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
    fail('Cube name contains unsupported characters.', ['name']);
  }
  const workingRepoName = decodeWorkingRepositoryName(input.working_repo_name, ['working_repo_name']);
  if (!CUBE_TEMPLATES.includes(input.template as CubeTemplate)) {
    fail('Unsupported cube template.', ['template']);
  }
  if (input.access !== 'manage') fail('Created cube access must be manage.', ['access']);
  return {
    result: input.result,
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    name,
    working_repo_name: workingRepoName,
    repository: decodeCreateCubeRepository(input.repository, ['repository']),
    template: input.template as CubeTemplate,
    human_seat_role_id: decodeUuid(input.human_seat_role_id, ['human_seat_role_id']),
    default_worker_role_id: decodeUuid(input.default_worker_role_id, ['default_worker_role_id']),
    access: 'manage',
  };
}

function decodeCreateCubeRepository(
  value: unknown,
  path: readonly (string | number)[],
): CreateCubeRepository {
  const input = record(value, path);
  exactKeys(input, ['kind', 'value'], ['kind', 'value'], path);
  if (input.kind === 'local') {
    return { kind: 'local', value: decodeUuid(input.value, [...path, 'value']) };
  }
  if (input.kind !== 'origin') fail('Unsupported repository identity kind.', [...path, 'kind']);
  const origin = boundedString(input.value, 1, 512, [...path, 'value']);
  try {
    if (canonicalizeRepositoryIdentity(origin).working_repo_origin !== origin) {
      fail('Repository origin must be canonical.', [...path, 'value']);
    }
  } catch (error) {
    if (error instanceof ProtocolContractError) throw error;
    if (error instanceof RuntimeMetadataValidationError) {
      fail('Repository origin must be canonical.', [...path, 'value']);
    }
    throw error;
  }
  return { kind: 'origin', value: origin };
}

export function decodeCreateCubeResponseEnvelope(value: unknown): ProtocolEnvelope<CreateCubeResponse> {
  return decodeProtocolEnvelope(value, decodeCreateCubeResponse);
}

export function decodeDeleteCubeRequest(value: unknown): DeleteCubeRequest {
  const input = record(value);
  exactKeys(input, [], []);
  return {};
}

export function decodeDeleteCubeRequestEnvelope(value: unknown): ProtocolEnvelope<DeleteCubeRequest> {
  return decodeProtocolEnvelope(value, decodeDeleteCubeRequest);
}

export function decodeDeleteCubeResponse(value: unknown): DeleteCubeResponse {
  const input = record(value);
  exactKeys(input, ['cube_id', 'deleted'], ['cube_id', 'deleted']);
  if (input.deleted !== true) fail('Cube deletion result must be terminal.', ['deleted']);
  return {
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    deleted: true,
  };
}

export function decodeDeleteCubeResponseEnvelope(value: unknown): ProtocolEnvelope<DeleteCubeResponse> {
  return decodeProtocolEnvelope(value, decodeDeleteCubeResponse);
}

export function decodeResolveRepositoryCubeRequest(value: unknown): ResolveRepositoryCubeRequest {
  const input = record(value);
  exactKeys(input, ['working_repo_name', 'repository'], ['working_repo_name', 'repository']);
  return {
    working_repo_name: decodeWorkingRepositoryName(input.working_repo_name, ['working_repo_name']),
    repository: decodeCreateCubeRepository(input.repository, ['repository']),
  };
}

export function decodeResolveRepositoryCubeRequestEnvelope(
  value: unknown,
): ProtocolEnvelope<ResolveRepositoryCubeRequest> {
  return decodeProtocolEnvelope(value, decodeResolveRepositoryCubeRequest);
}

export function decodeAssociateRepositoryCubeRequest(value: unknown): AssociateRepositoryCubeRequest {
  const input = record(value);
  exactKeys(
    input,
    ['cube_id', 'working_repo_name', 'repository'],
    ['cube_id', 'working_repo_name', 'repository'],
  );
  return {
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    working_repo_name: decodeWorkingRepositoryName(input.working_repo_name, ['working_repo_name']),
    repository: decodeCreateCubeRepository(input.repository, ['repository']),
  };
}

export function decodeAssociateRepositoryCubeRequestEnvelope(
  value: unknown,
): ProtocolEnvelope<AssociateRepositoryCubeRequest> {
  return decodeProtocolEnvelope(value, decodeAssociateRepositoryCubeRequest);
}

function decodeResolvedRepositoryCube(value: unknown): ResolvedRepositoryCube {
  const input = record(value);
  exactKeys(
    input,
    [
      'result',
      'cube_id',
      'name',
      'working_repo_name',
      'repository',
      'template',
      'human_seat_role_id',
      'default_worker_role_id',
      'access',
    ],
    [
      'result',
      'cube_id',
      'name',
      'working_repo_name',
      'repository',
      'template',
      'human_seat_role_id',
      'default_worker_role_id',
      'access',
    ],
  );
  if (input.result !== 'resolved') fail('Invalid repository cube result.', ['result']);
  const name = boundedString(input.name, 1, 120, ['name']);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
    fail('Cube name contains unsupported characters.', ['name']);
  }
  if (!CUBE_TEMPLATES.includes(input.template as CubeTemplate)) {
    fail('Unsupported cube template.', ['template']);
  }
  if (input.access !== 'manage') fail('Repository cube access must be manage.', ['access']);
  return {
    result: 'resolved',
    cube_id: decodeUuid(input.cube_id, ['cube_id']),
    name,
    working_repo_name: decodeWorkingRepositoryName(input.working_repo_name, ['working_repo_name']),
    repository: decodeCreateCubeRepository(input.repository, ['repository']),
    template: input.template as CubeTemplate,
    human_seat_role_id: decodeUuid(input.human_seat_role_id, ['human_seat_role_id']),
    default_worker_role_id: decodeUuid(input.default_worker_role_id, ['default_worker_role_id']),
    access: 'manage',
  };
}

export function decodeResolveRepositoryCubeResponse(value: unknown): ResolveRepositoryCubeResponse {
  const input = record(value);
  if (input.result === 'none') {
    exactKeys(input, ['result'], ['result']);
    return { result: 'none' };
  }
  return decodeResolvedRepositoryCube(input);
}

export function decodeResolveRepositoryCubeResponseEnvelope(
  value: unknown,
): ProtocolEnvelope<ResolveRepositoryCubeResponse> {
  return decodeProtocolEnvelope(value, decodeResolveRepositoryCubeResponse);
}

export function decodeAssociateRepositoryCubeResponse(value: unknown): AssociateRepositoryCubeResponse {
  return decodeResolvedRepositoryCube(value);
}

export function decodeAssociateRepositoryCubeResponseEnvelope(
  value: unknown,
): ProtocolEnvelope<AssociateRepositoryCubeResponse> {
  return decodeProtocolEnvelope(value, decodeAssociateRepositoryCubeResponse);
}

function decodeWorkingRepositoryName(
  value: unknown,
  path: readonly (string | number)[],
): string {
  const name = boundedString(value, 1, 120, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
    fail('Repository name contains unsupported characters.', path);
  }
  return name;
}

export function decodeAppendLogRequest(value: unknown): import('./types.js').AppendLogRequest {
  const input = record(value);
  exactKeys(
    input,
    ['post_id', 'message', 'visibility', 'recipientDroneIds', 'class', 'to', 'documents'],
    ['post_id', 'message'],
  );
  const output: import('./types.js').AppendLogRequest = {
    post_id: decodeUuid(input.post_id, ['post_id']),
    message: boundedString(input.message, 1, PROTOCOL_LIMIT_CEILINGS.max_log_message_bytes, ['message']),
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
  if (input.documents !== undefined) {
    output.documents = decodeStringArray(input.documents, 'documents', 100, 128)
      .map((id, index) => decodeOpaqueIdentifier(id, ['documents', index]));
  }
  if (
    output.to === undefined &&
    output.recipientDroneIds === undefined &&
    output.visibility !== 'broadcast' &&
    /\bto\s*:\s*\[[^\]\r\n]*\]\s*$/iu.test(output.message)
  ) {
    fail('Terminal to:[...] annotations require structured recipients or explicit broadcast visibility.', ['message']);
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
    decision: boundedString(input.decision, 1, DECISION_TEXT_MAX_BYTES, ['decision']),
  };
  if (input.rationale !== undefined) {
    output.rationale = boundedString(input.rationale, 1, DECISION_TEXT_MAX_BYTES, ['rationale']);
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

function metadataValidation<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof RuntimeMetadataValidationError) {
      fail(`${error.field}: ${error.reason}`, [error.field]);
    }
    throw error;
  }
}

/** Decode a complete runtime report. When present on attach, all four keys are required. */
export function decodeDroneRuntimeMetadata(value: unknown): DroneRuntimeMetadata {
  return metadataValidation(() => validateRuntimeMetadata(value));
}

/** Decode an atomic self-heal patch. Omitted means unchanged; null means clear. */
export function decodeDroneRuntimeMetadataPatch(value: unknown): DroneRuntimeMetadataPatch {
  return metadataValidation(() => validateRuntimeMetadataPatch(value));
}

/** Decode the flat runtime state carried by Drone objects in roster and regen responses. */
export function decodeDroneRuntimeMetadataState(value: unknown): UpdateDroneRuntimeMetadataResponse {
  const input = record(value);
  return metadataValidation(() => validateRuntimeMetadataReportState({
    agent_kind: input.agent_kind,
    reported_model: input.reported_model,
    working_repo_name: input.working_repo_name,
    working_repo_origin: input.working_repo_origin,
  }, input.runtime_metadata_reported));
}

/** Decode the nested runtime state carried by the own-seat identity response. */
export function decodeWhoAmIRuntimeMetadataState(value: unknown): UpdateDroneRuntimeMetadataResponse {
  const input = record(value);
  return metadataValidation(() => validateRuntimeMetadataReportState(
    input.runtime_metadata,
    input.runtime_metadata_reported,
  ));
}

export interface UpdateDroneRuntimeMetadataResponse {
  runtime_metadata: DroneRuntimeMetadata;
  runtime_metadata_reported: boolean;
}

export function decodeUpdateDroneRuntimeMetadataResponse(
  value: unknown,
): UpdateDroneRuntimeMetadataResponse {
  const input = record(value);
  exactKeys(input, ['runtime_metadata', 'runtime_metadata_reported'], [
    'runtime_metadata',
    'runtime_metadata_reported',
  ]);
  return metadataValidation(() => validateRuntimeMetadataReportState(
    input.runtime_metadata,
    input.runtime_metadata_reported,
  ));
}

export function decodeUpdateDroneRuntimeMetadataRequestEnvelope(
  value: unknown,
): ProtocolEnvelope<DroneRuntimeMetadataPatch> {
  return decodeProtocolEnvelope(value, decodeDroneRuntimeMetadataPatch);
}

export function decodeUpdateDroneRuntimeMetadataResponseEnvelope(
  value: unknown,
): ProtocolEnvelope<UpdateDroneRuntimeMetadataResponse> {
  return decodeProtocolEnvelope(value, decodeUpdateDroneRuntimeMetadataResponse);
}

// ── Clean-slate attach wire types (introduced in v3) ──────────────────────

export interface AttachRequest {
  cube_id: string;
  role_id: string;
  session_credential: string;
  prior_drone_id?: string;
  runtime_metadata?: DroneRuntimeMetadata;
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
  runtime_metadata: DroneRuntimeMetadata;
  runtime_metadata_reported: boolean;
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
  initial_log_cursor: LogCursor | null;
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
  exactKeys(
    input,
    ['id', 'label', 'runtime_metadata', 'runtime_metadata_reported'],
    ['id', 'label', 'runtime_metadata', 'runtime_metadata_reported'],
    path,
  );
  const state = metadataValidation(() => validateRuntimeMetadataReportState(
    input.runtime_metadata,
    input.runtime_metadata_reported,
  ));
  return {
    id: decodeUuid(input.id, [...path, 'id']),
    label: boundedString(input.label, 1, 128, [...path, 'label']),
    ...state,
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
 * Decode an attach request. Strict: exact keys, bounded sizes,
 * session_credential is token-safe and never echoed in errors.
 */
export function decodeAttachRequest(value: unknown): AttachRequest {
  const input = record(value);
  exactKeys(input, ['cube_id', 'role_id', 'session_credential', 'prior_drone_id', 'runtime_metadata'], [
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
  if (input.runtime_metadata !== undefined) {
    result.runtime_metadata = decodeDroneRuntimeMetadata(input.runtime_metadata);
  }
  return result;
}

/**
 * Create an attach request envelope. Stamps the canonical protocol version.
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
 * Decode an attach request envelope. Verifies protocol_version === PROTOCOL_VERSION
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
 * Decode an attach response. Strict: exact keys and result discriminant.
 */
export function decodeAttachResponse(value: unknown): AttachResponse {
  const input = record(value);
  exactKeys(input, ['result', 'cube', 'role', 'drone', 'session', 'initial_log_cursor'], [
    'result',
    'cube',
    'role',
    'drone',
    'session',
    'initial_log_cursor',
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
    initial_log_cursor: input.initial_log_cursor === null
      ? null
      : decodeLogCursor(input.initial_log_cursor, ['initial_log_cursor']),
  };
}

/**
 * Decode an attach response wrapped in a ProtocolEnvelope.
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
