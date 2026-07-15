import { ErrorCode } from './errors.js';
import { type ProtocolVersion } from './version.js';
export declare const SHARED_PACKAGE_NAME: "borgmcp-shared";
export declare const SHARED_PACKAGE_VERSION: "0.2.2";
export declare const HEALTH_PATH: "/healthz";
export declare const PROTOCOL_INFO_PATH: "/api/protocol";
export declare const ENROLLMENT_EXCHANGE_PATH: "/api/enrollment/exchange";
export declare const PROTOCOL_HTTP_CONTRACT: {
    readonly health: {
        readonly method: "GET";
        readonly path: "/healthz";
        readonly authenticated: false;
        readonly success_status: 204;
        readonly bodyless: true;
    };
    readonly protocol: {
        readonly method: "GET";
        readonly path: "/api/protocol";
        readonly authenticated: true;
        readonly success_status: 200;
    };
    readonly enrollment: {
        readonly method: "POST";
        readonly path: "/api/enrollment/exchange";
        readonly authenticated: "invitation";
        readonly success_status: 201;
    };
    readonly auth_missing_status: 401;
    readonly auth_invalid_status: 401;
    readonly cursor_expired_status: 410;
    readonly content_too_large_status: 413;
    readonly unsupported_protocol_status: 426;
    readonly unsupported_capability_status: 501;
    readonly redirect_policy: "error";
};
export declare const PROTOCOL_LIMIT_CEILINGS: {
    readonly max_request_bytes: number;
    readonly max_log_message_bytes: number;
    readonly max_read_page_size: 500;
    readonly max_replay_page_size: 1000;
};
export declare const KNOWN_CAPABILITIES: readonly ["coordination.core", "auth.bearer", "auth.revocation", "auth.retry-safe-enrollment", "scope.cube-isolation", "transport.tls", "authority.no-cloud-fallback", "log.cursor", "stream.sse", "stream.replay", "acks", "claims", "decisions"];
export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];
export type Capability = KnownCapability | (string & {});
export declare const REQUIRED_SECURITY_CAPABILITIES: readonly ["auth.bearer", "auth.revocation", "auth.retry-safe-enrollment", "scope.cube-isolation", "transport.tls", "authority.no-cloud-fallback"];
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
export interface EnrollmentExchangeRequest {
    invitation: string;
    retry_key: string;
    client_credential: string;
    client_name?: string;
}
export interface ClientEnrollmentExchangeResponse {
    purpose: 'client';
    client_id: string;
}
export interface BootstrapEnrollmentExchangeResponse {
    purpose: 'bootstrap';
    client_id: string;
    cube_id: string;
    human_seat_role_id: string;
    default_worker_role_id: string;
    access: 'manage';
}
export type EnrollmentExchangeResponse = ClientEnrollmentExchangeResponse | BootstrapEnrollmentExchangeResponse;
export interface AckLogRequest {
    entry_id: string;
    kind: 'ack' | 'claim';
}
export type RemoveDecisionRequest = {
    topic: string;
} | {
    decision_id: string;
};
export interface LogCursor {
    id: string;
    created_at: string;
}
export declare class ProtocolContractError extends Error {
    readonly code: ErrorCode;
    readonly path: readonly (string | number)[];
    constructor(message: string, code?: ErrorCode, path?: readonly (string | number)[]);
}
export declare function utf8ByteLength(value: string): number;
export declare function decodeProtocolInfo(value: unknown): ProtocolInfo;
export declare function negotiateProtocol(value: unknown, requiredCapabilities?: readonly Capability[]): ProtocolInfo;
export declare function createProtocolEnvelope<T>(requestId: string, payload: T): ProtocolEnvelope<T>;
export declare function decodeProtocolEnvelope<T>(value: unknown, decodePayload: (payload: unknown) => T): ProtocolEnvelope<T>;
export declare function decodeProtocolInfoEnvelope(value: unknown): ProtocolEnvelope<ProtocolInfo>;
export declare function decodeProtocolErrorEnvelope(value: unknown): ProtocolErrorEnvelope;
export declare function decodeEnrollmentExchangeRequest(value: unknown): EnrollmentExchangeRequest;
export declare function decodeEnrollmentExchangeRequestEnvelope(value: unknown): ProtocolEnvelope<EnrollmentExchangeRequest>;
export declare function decodeEnrollmentExchangeResponse(value: unknown): EnrollmentExchangeResponse;
export declare function decodeEnrollmentExchangeResponseEnvelope(value: unknown): ProtocolEnvelope<EnrollmentExchangeResponse>;
export declare function decodeAppendLogRequest(value: unknown): import('./types.js').AppendLogRequest;
export declare function decodeAckLogRequest(value: unknown): AckLogRequest;
export declare function decodeRecordDecisionRequest(value: unknown): import('./types.js').RecordDecisionRequest;
export declare function decodeRemoveDecisionRequest(value: unknown): RemoveDecisionRequest;
export declare function decodeCanonicalTimestamp(value: unknown, path?: readonly (string | number)[]): string;
export declare function decodeLogCursor(value: unknown, path?: readonly (string | number)[]): LogCursor;
export declare function decodeUuid(value: unknown, path?: readonly (string | number)[]): string;
export declare function decodeEnrollmentClientCredential(value: unknown, path?: readonly (string | number)[]): string;
export declare function decodeOpaqueIdentifier(value: unknown, path?: readonly (string | number)[]): string;
export declare function redactProtocolDiagnostic(value: string): string;
export declare function compareLogCursor(a: LogCursor, b: LogCursor): -1 | 0 | 1;
export declare function maxLogCursor(a: LogCursor | null, b: LogCursor | null): LogCursor | null;
//# sourceMappingURL=contract.d.ts.map