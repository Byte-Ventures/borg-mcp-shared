import { ErrorCode } from './errors.js';
import { type ProtocolVersion } from './version.js';
export declare const SHARED_PACKAGE_NAME: "borgmcp-shared";
export declare const SHARED_PACKAGE_VERSION: "0.4.3";
export declare const HEALTH_PATH: "/healthz";
export declare const PROTOCOL_INFO_PATH: "/api/protocol";
export declare const ENROLLMENT_EXCHANGE_PATH: "/api/enrollment/exchange";
export declare const CUBES_PATH: "/api/cubes";
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
        readonly authenticated: false;
        readonly success_status: 200;
    };
    readonly enrollment: {
        readonly method: "POST";
        readonly path: "/api/enrollment/exchange";
        readonly authenticated: "invitation";
        readonly success_status: 201;
    };
    readonly cubes: {
        readonly method: "POST";
        readonly path: "/api/cubes";
        readonly authenticated: true;
        readonly success_status: 201;
    };
    readonly drone_reassign: {
        readonly method: "PATCH";
        readonly path: "/api/cubes/:cubeId/drones/:droneId";
        readonly authenticated: true;
        readonly success_status: 200;
    };
    readonly drone_evict: {
        readonly method: "DELETE";
        readonly path: "/api/cubes/:cubeId/drones/:droneId";
        readonly authenticated: true;
        readonly success_status: 200;
    };
    readonly auth_missing_status: 401;
    readonly auth_invalid_status: 401;
    readonly auth_expired_status: 401;
    readonly session_revoked_status: 401;
    readonly session_rejected_status: 401;
    readonly cursor_expired_status: 410;
    readonly drone_evicted_status: 410;
    readonly content_too_large_status: 413;
    readonly unsupported_protocol_status: 426;
    readonly redirect_policy: "error";
};
export declare const PROTOCOL_LIMIT_CEILINGS: {
    readonly max_request_bytes: number;
    readonly max_log_message_bytes: number;
    readonly max_read_page_size: 500;
    readonly max_replay_page_size: 1000;
};
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
export interface EnrollmentExchangeRequest {
    invitation: string;
    retry_key: string;
    client_credential: string;
    client_name?: string;
}
export declare const SERVER_CAPABILITIES: readonly ["create_cube"];
export type ServerCapability = (typeof SERVER_CAPABILITIES)[number];
export interface ClientEnrollmentExchangeResponse {
    purpose: 'client';
    client_id: string;
    server_capabilities: [];
}
export interface OwnerEnrollmentExchangeResponse {
    purpose: 'owner';
    client_id: string;
    server_capabilities: ['create_cube'];
}
export type EnrollmentExchangeResponse = ClientEnrollmentExchangeResponse | OwnerEnrollmentExchangeResponse;
export declare const CUBE_TEMPLATES: readonly ["default"];
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
export declare function createProtocolTagPreflight(): ProtocolTagPreflight;
export declare function decodeProtocolTagPreflight(value: unknown): ProtocolTagPreflight;
export declare function createProtocolEnvelope<T>(requestId: string, payload: T): ProtocolEnvelope<T>;
export declare function decodeProtocolEnvelope<T>(value: unknown, decodePayload: (payload: unknown) => T): ProtocolEnvelope<T>;
export declare function decodeProtocolErrorEnvelope(value: unknown): ProtocolErrorEnvelope;
export declare function decodeEnrollmentExchangeRequest(value: unknown): EnrollmentExchangeRequest;
export declare function decodeEnrollmentExchangeRequestEnvelope(value: unknown): ProtocolEnvelope<EnrollmentExchangeRequest>;
export declare function decodeEnrollmentExchangeResponse(value: unknown): EnrollmentExchangeResponse;
export declare function decodeEnrollmentExchangeResponseEnvelope(value: unknown): ProtocolEnvelope<EnrollmentExchangeResponse>;
export declare function decodeCreateCubeRequest(value: unknown): CreateCubeRequest;
export declare function decodeCreateCubeRequestEnvelope(value: unknown): ProtocolEnvelope<CreateCubeRequest>;
export declare function decodeCreateCubeResponse(value: unknown): CreateCubeResponse;
export declare function decodeCreateCubeResponseEnvelope(value: unknown): ProtocolEnvelope<CreateCubeResponse>;
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
export declare const ATTACH_PATH: "/api/client/attach";
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
export declare function decodeAttachRequest(value: unknown): AttachRequest;
export declare function createAttachRequestEnvelope(requestId: string, payload: AttachRequest): ProtocolEnvelope<AttachRequest>;
export declare function decodeAttachRequestEnvelope(value: unknown): ProtocolEnvelope<AttachRequest>;
export declare function decodeAttachResponse(value: unknown): AttachResponse;
export declare function decodeAttachResponseEnvelope(value: unknown): ProtocolEnvelope<AttachResponse>;
//# sourceMappingURL=contract.d.ts.map