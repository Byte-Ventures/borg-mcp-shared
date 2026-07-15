import { ErrorCode } from './errors.js';
import { PROTOCOL_VERSION } from './version.js';
export const SHARED_PACKAGE_NAME = 'borgmcp-shared';
export const SHARED_PACKAGE_VERSION = '0.3.0';
export const HEALTH_PATH = '/healthz';
export const PROTOCOL_INFO_PATH = '/api/protocol';
export const ENROLLMENT_EXCHANGE_PATH = '/api/enrollment/exchange';
export const CUBES_PATH = '/api/cubes';
export const PROTOCOL_HTTP_CONTRACT = {
    health: { method: 'GET', path: HEALTH_PATH, authenticated: false, success_status: 204, bodyless: true },
    protocol: { method: 'GET', path: PROTOCOL_INFO_PATH, authenticated: true, success_status: 200 },
    enrollment: { method: 'POST', path: ENROLLMENT_EXCHANGE_PATH, authenticated: 'invitation', success_status: 201 },
    cubes: { method: 'POST', path: CUBES_PATH, authenticated: true, success_status: 201 },
    auth_missing_status: 401,
    auth_invalid_status: 401,
    cursor_expired_status: 410,
    content_too_large_status: 413,
    unsupported_protocol_status: 426,
    unsupported_capability_status: 501,
    redirect_policy: 'error',
};
export const PROTOCOL_LIMIT_CEILINGS = {
    max_request_bytes: 10 * 1024 * 1024,
    max_log_message_bytes: 1024 * 1024,
    max_read_page_size: 500,
    max_replay_page_size: 1000,
};
export const KNOWN_CAPABILITIES = [
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
];
export const REQUIRED_SECURITY_CAPABILITIES = [
    'auth.bearer',
    'auth.revocation',
    'auth.retry-safe-enrollment',
    'scope.cube-isolation',
    'transport.tls',
    'authority.no-cloud-fallback',
];
export const SERVER_CAPABILITIES = ['create_cube'];
export const CUBE_TEMPLATES = ['default'];
export class ProtocolContractError extends Error {
    code;
    path;
    constructor(message, code = ErrorCode.INVALID_INPUT, path = []) {
        super(message);
        this.code = code;
        this.path = path;
        this.name = 'ProtocolContractError';
    }
}
function fail(message, path = []) {
    throw new ProtocolContractError(message, ErrorCode.INVALID_INPUT, path);
}
function record(value, path = []) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail('Expected an object.', path);
    }
    return value;
}
function exactKeys(value, allowed, required, path = []) {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key))
            fail(`Unknown field "${key}".`, [...path, key]);
    }
    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            fail(`Missing field "${key}".`, [...path, key]);
        }
    }
}
function boundedString(value, min, max, path) {
    if (typeof value !== 'string')
        fail('Expected a string.', path);
    const bytes = utf8ByteLength(value);
    if (bytes < min || bytes > max) {
        fail(`Expected a string between ${min} and ${max} UTF-8 bytes.`, path);
    }
    return value;
}
export function utf8ByteLength(value) {
    let bytes = 0;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code <= 0x7f)
            bytes += 1;
        else if (code <= 0x7ff)
            bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
            value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
            bytes += 4;
            index++;
        }
        else
            bytes += 3;
    }
    return bytes;
}
function isSemanticVersion(value) {
    const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
    if (!match)
        return false;
    const prerelease = match[4];
    return prerelease === undefined || prerelease.split('.').every((identifier) => !/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0'));
}
function boundedPositiveInteger(value, maximum, path) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
        fail(`Expected a positive safe integer no greater than ${maximum}.`, path);
    }
    return value;
}
function opaqueIdentifier(value, path) {
    const identifier = boundedString(value, 1, 128, path);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(identifier)) {
        fail('Expected a URL-safe opaque identifier.', path);
    }
    return identifier;
}
function opaqueToken(value, path) {
    const token = boundedString(value, 43, 1024, path);
    if (!/^[A-Za-z0-9_-]+$/.test(token)) {
        fail('Expected an unpadded base64url token.', path);
    }
    return token;
}
function decodeRequestId(value, path) {
    const decoded = boundedString(value, 8, 128, path);
    if (!/^[A-Za-z0-9._-]+$/.test(decoded)) {
        fail('Request id contains unsupported characters.', path);
    }
    return decoded;
}
function capabilityName(value, path) {
    const decoded = boundedString(value, 1, 64, path);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(decoded)) {
        fail('Capability name contains unsupported characters.', path);
    }
    return decoded;
}
export function decodeProtocolInfo(value) {
    const input = record(value);
    exactKeys(input, ['protocol_version', 'package', 'capabilities', 'limits'], [
        'protocol_version',
        'package',
        'capabilities',
        'limits',
    ]);
    if (input.protocol_version !== PROTOCOL_VERSION) {
        throw new ProtocolContractError(`Unsupported protocol version "${String(input.protocol_version)}".`, ErrorCode.UNSUPPORTED_PROTOCOL_VERSION, ['protocol_version']);
    }
    const packageInfo = record(input.package, ['package']);
    exactKeys(packageInfo, ['name', 'version'], ['name', 'version'], ['package']);
    if (packageInfo.name !== SHARED_PACKAGE_NAME) {
        fail(`Expected package name "${SHARED_PACKAGE_NAME}".`, ['package', 'name']);
    }
    const packageVersion = boundedString(packageInfo.version, 5, 64, ['package', 'version']);
    if (!isSemanticVersion(packageVersion)) {
        fail('Expected a semantic package version.', ['package', 'version']);
    }
    if (!Array.isArray(input.capabilities))
        fail('Expected an array.', ['capabilities']);
    const capabilities = input.capabilities.map((capability, index) => {
        return capabilityName(capability, ['capabilities', index]);
    });
    if (new Set(capabilities).size !== capabilities.length) {
        fail('Capabilities must be unique.', ['capabilities']);
    }
    const limits = record(input.limits, ['limits']);
    exactKeys(limits, [
        'max_request_bytes',
        'max_log_message_bytes',
        'max_read_page_size',
        'max_replay_page_size',
    ], [
        'max_request_bytes',
        'max_log_message_bytes',
        'max_read_page_size',
        'max_replay_page_size',
    ], ['limits']);
    return {
        protocol_version: PROTOCOL_VERSION,
        package: { name: SHARED_PACKAGE_NAME, version: packageVersion },
        capabilities,
        limits: {
            max_request_bytes: boundedPositiveInteger(limits.max_request_bytes, PROTOCOL_LIMIT_CEILINGS.max_request_bytes, ['limits', 'max_request_bytes']),
            max_log_message_bytes: boundedPositiveInteger(limits.max_log_message_bytes, PROTOCOL_LIMIT_CEILINGS.max_log_message_bytes, ['limits', 'max_log_message_bytes']),
            max_read_page_size: boundedPositiveInteger(limits.max_read_page_size, PROTOCOL_LIMIT_CEILINGS.max_read_page_size, ['limits', 'max_read_page_size']),
            max_replay_page_size: boundedPositiveInteger(limits.max_replay_page_size, PROTOCOL_LIMIT_CEILINGS.max_replay_page_size, ['limits', 'max_replay_page_size']),
        },
    };
}
export function negotiateProtocol(value, requiredCapabilities = []) {
    const info = decodeProtocolInfo(value);
    const required = [...REQUIRED_SECURITY_CAPABILITIES, ...requiredCapabilities];
    for (const capability of new Set(required)) {
        if (!info.capabilities.includes(capability)) {
            throw new ProtocolContractError(`Required capability "${capability}" is unavailable.`, ErrorCode.UNSUPPORTED_CAPABILITY, ['capabilities']);
        }
    }
    return info;
}
export function createProtocolEnvelope(requestId, payload) {
    return {
        protocol_version: PROTOCOL_VERSION,
        request_id: decodeRequestId(requestId, ['request_id']),
        payload,
    };
}
export function decodeProtocolEnvelope(value, decodePayload) {
    const input = record(value);
    exactKeys(input, ['protocol_version', 'request_id', 'payload'], [
        'protocol_version',
        'request_id',
        'payload',
    ]);
    if (input.protocol_version !== PROTOCOL_VERSION) {
        throw new ProtocolContractError(`Unsupported protocol version "${String(input.protocol_version)}".`, ErrorCode.UNSUPPORTED_PROTOCOL_VERSION, ['protocol_version']);
    }
    const decodedRequestId = decodeRequestId(input.request_id, ['request_id']);
    return {
        protocol_version: PROTOCOL_VERSION,
        request_id: decodedRequestId,
        payload: decodePayload(input.payload),
    };
}
export function decodeProtocolInfoEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeProtocolInfo);
}
export function decodeProtocolErrorEnvelope(value) {
    const input = record(value);
    exactKeys(input, ['protocol_version', 'request_id', 'error'], ['protocol_version', 'error']);
    if (input.protocol_version !== PROTOCOL_VERSION) {
        throw new ProtocolContractError(`Unsupported protocol version "${String(input.protocol_version)}".`, ErrorCode.UNSUPPORTED_PROTOCOL_VERSION, ['protocol_version']);
    }
    const error = record(input.error, ['error']);
    exactKeys(error, [
        'code',
        'message',
        'details',
        'retry_after',
        'required_capability',
        'supported_versions',
    ], ['code', 'message'], ['error']);
    if (typeof error.code !== 'string' || !Object.values(ErrorCode).includes(error.code)) {
        fail('Unknown protocol error code.', ['error', 'code']);
    }
    const decodedError = {
        code: error.code,
        message: redactProtocolDiagnostic(boundedString(error.message, 1, 512, ['error', 'message'])),
    };
    if (error.details !== undefined) {
        decodedError.details = redactProtocolDiagnostic(boundedString(error.details, 1, 2048, ['error', 'details']));
    }
    if (error.retry_after !== undefined) {
        decodedError.retry_after = boundedPositiveInteger(error.retry_after, 86_400, ['error', 'retry_after']);
    }
    if (error.required_capability !== undefined) {
        decodedError.required_capability = capabilityName(error.required_capability, ['error', 'required_capability']);
    }
    if (error.supported_versions !== undefined) {
        if (!Array.isArray(error.supported_versions) || error.supported_versions.length === 0 ||
            error.supported_versions.length > 16 ||
            !error.supported_versions.every((version) => version === PROTOCOL_VERSION) ||
            new Set(error.supported_versions).size !== error.supported_versions.length) {
            fail('Invalid supported protocol versions.', ['error', 'supported_versions']);
        }
        decodedError.supported_versions = [...error.supported_versions];
    }
    const decodedRequestId = input.request_id === undefined
        ? undefined
        : decodeRequestId(input.request_id, ['request_id']);
    return decodedRequestId === undefined
        ? { protocol_version: PROTOCOL_VERSION, error: decodedError }
        : { protocol_version: PROTOCOL_VERSION, request_id: decodedRequestId, error: decodedError };
}
export function decodeEnrollmentExchangeRequest(value) {
    const input = record(value);
    exactKeys(input, ['invitation', 'retry_key', 'client_credential', 'client_name'], ['invitation', 'retry_key', 'client_credential']);
    const invitation = opaqueToken(input.invitation, ['invitation']);
    const retryKey = decodeUuid(input.retry_key, ['retry_key']);
    const clientCredential = decodeEnrollmentClientCredential(input.client_credential, ['client_credential']);
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
export function decodeEnrollmentExchangeRequestEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeEnrollmentExchangeRequest);
}
export function decodeEnrollmentExchangeResponse(value) {
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
    if (input.purpose !== 'owner')
        fail('Invalid enrollment purpose.', ['purpose']);
    exactKeys(input, ['purpose', 'client_id', 'server_capabilities'], ['purpose', 'client_id', 'server_capabilities']);
    decodeExactServerCapabilities(input.server_capabilities, ['create_cube'], ['server_capabilities']);
    return {
        purpose: 'owner',
        client_id: decodeUuid(input.client_id, ['client_id']),
        server_capabilities: ['create_cube'],
    };
}
export function decodeEnrollmentExchangeResponseEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeEnrollmentExchangeResponse);
}
function decodeExactServerCapabilities(value, expected, path) {
    if (!Array.isArray(value) || value.length !== expected.length ||
        value.some((capability, index) => capability !== expected[index])) {
        fail(`Expected server capabilities [${expected.join(', ')}].`, path);
    }
}
export function decodeCreateCubeRequest(value) {
    const input = record(value);
    exactKeys(input, ['retry_key', 'name', 'template'], ['retry_key', 'name', 'template']);
    const name = boundedString(input.name, 1, 120, ['name']);
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(name)) {
        fail('Cube name contains unsupported characters.', ['name']);
    }
    if (!CUBE_TEMPLATES.includes(input.template)) {
        fail('Unsupported cube template.', ['template']);
    }
    return {
        retry_key: decodeUuid(input.retry_key, ['retry_key']),
        name,
        template: input.template,
    };
}
export function decodeCreateCubeRequestEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeCreateCubeRequest);
}
export function decodeCreateCubeResponse(value) {
    const input = record(value);
    exactKeys(input, ['cube_id', 'human_seat_role_id', 'default_worker_role_id', 'access'], ['cube_id', 'human_seat_role_id', 'default_worker_role_id', 'access']);
    if (input.access !== 'manage')
        fail('Created cube access must be manage.', ['access']);
    return {
        cube_id: decodeUuid(input.cube_id, ['cube_id']),
        human_seat_role_id: decodeUuid(input.human_seat_role_id, ['human_seat_role_id']),
        default_worker_role_id: decodeUuid(input.default_worker_role_id, ['default_worker_role_id']),
        access: 'manage',
    };
}
export function decodeCreateCubeResponseEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeCreateCubeResponse);
}
export function decodeAppendLogRequest(value) {
    const input = record(value);
    exactKeys(input, ['message', 'visibility', 'recipientDroneIds', 'class', 'to'], ['message']);
    const output = {
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
        output.recipientDroneIds = input.recipientDroneIds.map((id, index) => decodeUuid(id, ['recipientDroneIds', index]));
    }
    if (input.class !== undefined) {
        output.class = boundedString(input.class, 1, 64, ['class']);
    }
    if (input.to !== undefined) {
        output.to = decodeStringArray(input.to, 'to', 100, 120);
    }
    return output;
}
function decodeStringArray(value, field, maxItems, maxLength) {
    if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
        fail(`Expected ${field} to contain 1-${maxItems} values.`, [field]);
    }
    const decoded = value.map((item, index) => boundedString(item, 1, maxLength, [field, index]));
    if (new Set(decoded).size !== decoded.length)
        fail(`${field} values must be unique.`, [field]);
    return decoded;
}
export function decodeAckLogRequest(value) {
    const input = record(value);
    exactKeys(input, ['entry_id', 'kind'], ['entry_id']);
    const kind = input.kind ?? 'ack';
    if (kind !== 'ack' && kind !== 'claim')
        fail('Invalid ack kind.', ['kind']);
    return {
        entry_id: decodeUuid(input.entry_id, ['entry_id']),
        kind,
    };
}
export function decodeRecordDecisionRequest(value) {
    const input = record(value);
    exactKeys(input, ['topic', 'decision', 'rationale'], ['topic', 'decision']);
    const output = {
        topic: boundedString(input.topic, 1, 120, ['topic']),
        decision: boundedString(input.decision, 1, 2000, ['decision']),
    };
    if (input.rationale !== undefined) {
        output.rationale = boundedString(input.rationale, 1, 2000, ['rationale']);
    }
    return output;
}
export function decodeRemoveDecisionRequest(value) {
    const input = record(value);
    exactKeys(input, ['topic', 'decision_id'], []);
    const hasTopic = input.topic !== undefined;
    const hasId = input.decision_id !== undefined;
    if (hasTopic === hasId)
        fail('Exactly one decision selector is required.');
    return hasTopic
        ? { topic: boundedString(input.topic, 1, 120, ['topic']) }
        : { decision_id: decodeUuid(input.decision_id, ['decision_id']) };
}
export function decodeCanonicalTimestamp(value, path = []) {
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
export function decodeLogCursor(value, path = []) {
    const input = record(value, path);
    exactKeys(input, ['id', 'created_at'], ['id', 'created_at'], path);
    return {
        id: decodeUuid(input.id, [...path, 'id']),
        created_at: decodeCanonicalTimestamp(input.created_at, [...path, 'created_at']),
    };
}
export function decodeUuid(value, path = []) {
    const id = boundedString(value, 36, 36, path);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        fail('Expected a canonical UUID.', path);
    }
    return id.toLowerCase();
}
export function decodeEnrollmentClientCredential(value, path = []) {
    const credential = boundedString(value, 43, 43, path);
    if (!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(credential)) {
        fail('Expected an unpadded base64url encoding of exactly 256 bits.', path);
    }
    return credential;
}
export function decodeOpaqueIdentifier(value, path = []) {
    return opaqueIdentifier(value, path);
}
export function redactProtocolDiagnostic(value) {
    return value
        .replace(/(\bretry[_-]?key\b["']?\s*(?:=|:)\s*["']?)[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '$1<REDACTED>')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
        .replace(/\bBearer\s+[A-Za-z0-9_-]{20,}/gi, 'Bearer <REDACTED>')
        .replace(/[A-Za-z0-9_-]{43,}/g, '<REDACTED>');
}
export function compareLogCursor(a, b) {
    const left = decodeLogCursor(a);
    const right = decodeLogCursor(b);
    if (left.created_at !== right.created_at)
        return left.created_at < right.created_at ? -1 : 1;
    if (left.id === right.id)
        return 0;
    return left.id < right.id ? -1 : 1;
}
export function maxLogCursor(a, b) {
    if (a === null)
        return b === null ? null : decodeLogCursor(b);
    if (b === null)
        return decodeLogCursor(a);
    return compareLogCursor(a, b) >= 0 ? decodeLogCursor(a) : decodeLogCursor(b);
}
//# sourceMappingURL=contract.js.map