import { ErrorCode } from './errors.js';
import { type ProtocolVersion } from './version.js';
import type { DroneRuntimeMetadata, DroneRuntimeMetadataPatch } from './types.js';
export declare const SHARED_PACKAGE_NAME: "borgmcp-shared";
export declare const SHARED_PACKAGE_VERSION: "0.8.1";
export declare const DECISION_TEXT_MAX_BYTES: 512;
export declare const HEALTH_PATH: "/healthz";
export declare const PROTOCOL_INFO_PATH: "/api/protocol";
export declare const ENROLLMENT_EXCHANGE_PATH: "/api/enrollment/exchange";
export declare const CUBES_PATH: "/api/cubes";
export declare const CUBE_PATH: "/api/cubes/:cubeId";
export declare const REPOSITORY_CUBE_RESOLVE_PATH: "/api/repository-cubes/resolve";
export declare const REPOSITORY_CUBE_ASSOCIATION_PATH: "/api/repository-cubes/association";
export declare const ATTACH_PATH: "/api/client/attach";
export declare const SELF_RUNTIME_METADATA_PATH: "/api/cubes/:cubeId/drones/self/metadata";
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
    readonly cube_delete: {
        readonly method: "DELETE";
        readonly path: "/api/cubes/:cubeId";
        readonly authenticated: true;
        readonly success_status: 200;
        readonly mutation: true;
    };
    readonly repository_cube_resolve: {
        readonly method: "POST";
        readonly path: "/api/repository-cubes/resolve";
        readonly authenticated: true;
        readonly success_status: 200;
        readonly mutation: false;
    };
    readonly repository_cube_association: {
        readonly method: "PUT";
        readonly path: "/api/repository-cubes/association";
        readonly authenticated: true;
        readonly success_status: 200;
        readonly mutation: true;
    };
    readonly attach: {
        readonly method: "POST";
        readonly path: "/api/client/attach";
        readonly authenticated: true;
        readonly success_status: 200;
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
    readonly drone_self_metadata: {
        readonly method: "PATCH";
        readonly path: "/api/cubes/:cubeId/drones/self/metadata";
        readonly authenticated: "drone-session";
        readonly success_status: 200;
    };
    readonly auth_missing_status: 401;
    readonly auth_invalid_status: 401;
    readonly auth_expired_status: 401;
    readonly session_revoked_status: 401;
    readonly session_rejected_status: 401;
    readonly cursor_expired_status: 410;
    readonly cube_deleted_status: 410;
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
export declare const INVITATION_ARTIFACT_VERSION: 2;
export type InvitationAuthority = 'client' | 'owner';
export interface InvitationArtifact {
    version: typeof INVITATION_ARTIFACT_VERSION;
    endpoint: string;
    ca_spki_sha256: string;
    authority: InvitationAuthority;
    secret: string;
    integrity: string;
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
export declare const CUBE_TEMPLATES: readonly ["default", "software-dev", "starter", "local-model"];
export type CubeTemplate = (typeof CUBE_TEMPLATES)[number];
export type CreateCubeRepository = {
    kind: 'origin';
    value: string;
} | {
    kind: 'local';
    value: string;
};
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
export type ResolveRepositoryCubeResponse = {
    result: 'none';
} | ResolvedRepositoryCube;
export type AssociateRepositoryCubeResponse = ResolvedRepositoryCube;
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
export declare function getInvitationArtifactIntegrityInput(value: InvitationArtifact): string;
export declare function encodeInvitationArtifact(value: InvitationArtifact): string;
export declare function decodeInvitationArtifact(value: unknown): InvitationArtifact;
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
export declare function decodeDeleteCubeRequest(value: unknown): DeleteCubeRequest;
export declare function decodeDeleteCubeRequestEnvelope(value: unknown): ProtocolEnvelope<DeleteCubeRequest>;
export declare function decodeDeleteCubeResponse(value: unknown): DeleteCubeResponse;
export declare function decodeDeleteCubeResponseEnvelope(value: unknown): ProtocolEnvelope<DeleteCubeResponse>;
export declare function decodeResolveRepositoryCubeRequest(value: unknown): ResolveRepositoryCubeRequest;
export declare function decodeResolveRepositoryCubeRequestEnvelope(value: unknown): ProtocolEnvelope<ResolveRepositoryCubeRequest>;
export declare function decodeAssociateRepositoryCubeRequest(value: unknown): AssociateRepositoryCubeRequest;
export declare function decodeAssociateRepositoryCubeRequestEnvelope(value: unknown): ProtocolEnvelope<AssociateRepositoryCubeRequest>;
export declare function decodeResolveRepositoryCubeResponse(value: unknown): ResolveRepositoryCubeResponse;
export declare function decodeResolveRepositoryCubeResponseEnvelope(value: unknown): ProtocolEnvelope<ResolveRepositoryCubeResponse>;
export declare function decodeAssociateRepositoryCubeResponse(value: unknown): AssociateRepositoryCubeResponse;
export declare function decodeAssociateRepositoryCubeResponseEnvelope(value: unknown): ProtocolEnvelope<AssociateRepositoryCubeResponse>;
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
export declare function decodeDroneRuntimeMetadata(value: unknown): DroneRuntimeMetadata;
export declare function decodeDroneRuntimeMetadataPatch(value: unknown): DroneRuntimeMetadataPatch;
export declare function decodeDroneRuntimeMetadataState(value: unknown): UpdateDroneRuntimeMetadataResponse;
export declare function decodeWhoAmIRuntimeMetadataState(value: unknown): UpdateDroneRuntimeMetadataResponse;
export interface UpdateDroneRuntimeMetadataResponse {
    runtime_metadata: DroneRuntimeMetadata;
    runtime_metadata_reported: boolean;
}
export declare function decodeUpdateDroneRuntimeMetadataResponse(value: unknown): UpdateDroneRuntimeMetadataResponse;
export declare function decodeUpdateDroneRuntimeMetadataRequestEnvelope(value: unknown): ProtocolEnvelope<DroneRuntimeMetadataPatch>;
export declare function decodeUpdateDroneRuntimeMetadataResponseEnvelope(value: unknown): ProtocolEnvelope<UpdateDroneRuntimeMetadataResponse>;
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
}
export declare function decodeAttachRequest(value: unknown): AttachRequest;
export declare function createAttachRequestEnvelope(requestId: string, payload: AttachRequest): ProtocolEnvelope<AttachRequest>;
export declare function decodeAttachRequestEnvelope(value: unknown): ProtocolEnvelope<AttachRequest>;
export declare function decodeAttachResponse(value: unknown): AttachResponse;
export declare function decodeAttachResponseEnvelope(value: unknown): ProtocolEnvelope<AttachResponse>;
//# sourceMappingURL=contract.d.ts.map