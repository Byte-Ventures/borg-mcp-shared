import { type CreateCubeResponse, type LogCursor } from '../protocol/index.js';
export interface ConformanceHttpResponse {
    status: number;
    body: unknown;
}
export interface ConformancePrincipal {
    readonly id: string;
}
export interface ConformanceCube {
    readonly id: string;
}
export interface ConformanceAuthorityState {
    enrolled_clients: number;
    enrollment_claims: number;
    cubes: number;
    roles: number;
    grants: number;
    server_capabilities: number;
    cube_create_bindings: number;
}
export interface ConformanceCreatedCubeState {
    cube_exists: boolean;
    creator_has_grant: boolean;
    grant_count: number;
    role_count: number;
    human_seat_role_matches: boolean;
    default_worker_role_matches: boolean;
}
export interface ConformanceEnrollmentPrincipalState {
    response_client_matches: boolean;
    active_credential_bindings: number;
}
export interface ConformanceReplayBarrier {
    readonly reached: Promise<void>;
    release(): void;
}
export interface ConformanceStreamResponse extends ConformanceHttpResponse {
    stream: AsyncIterable<string> | null;
}
export interface ConformanceAdmin {
    reset(): Promise<void>;
    createPrincipal(name: string): Promise<ConformancePrincipal>;
    createCube(name: string): Promise<ConformanceCube>;
    grantCube(principal: ConformancePrincipal, cube: ConformanceCube): Promise<void>;
    grantCreateCubeCapability(principal: ConformancePrincipal): Promise<void>;
    issueDroneSession(principal: ConformancePrincipal): Promise<string>;
    issueSingleUseInvitation(principal: ConformancePrincipal, purpose: 'owner' | 'client'): Promise<string>;
    observeAuthorityState(): Promise<ConformanceAuthorityState>;
    inspectCreatedCube(creator: ConformancePrincipal, response: CreateCubeResponse): Promise<ConformanceCreatedCubeState>;
    inspectEnrollmentPrincipal(principal: ConformancePrincipal, responseClientId: string): Promise<ConformanceEnrollmentPrincipalState>;
    revokePrincipal(principal: ConformancePrincipal): Promise<void>;
    expireCursor(cube: ConformanceCube, cursor: LogCursor): Promise<void>;
    armReplayTransition(): ConformanceReplayBarrier;
}
export interface ConformanceOperations {
    health(): Promise<ConformanceHttpResponse>;
    protocol(credential: string | null): Promise<ConformanceHttpResponse>;
    enroll(request: unknown): Promise<ConformanceHttpResponse>;
    createCube(credential: string | null, request: unknown): Promise<ConformanceHttpResponse>;
    append(credential: string, cube: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse>;
    appendRaw(credential: string, cube: ConformanceCube, body: string): Promise<ConformanceHttpResponse>;
    read(credential: string, cube: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse>;
    ack(credential: string, cube: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse>;
    recordDecision(credential: string, cube: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse>;
    listDecisions(credential: string, cube: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse>;
    openStream(credential: string, cube: ConformanceCube, cursor: LogCursor | null): Promise<ConformanceStreamResponse>;
}
export interface ConformanceEnvironment {
    readonly admin: ConformanceAdmin;
    readonly operations: ConformanceOperations;
}
export declare const ADAPTER_CONFORMANCE_FIXTURES: readonly [{
    readonly id: "http.unauthenticated-liveness";
    readonly area: "http";
}, {
    readonly id: "protocol.enrollment-auth";
    readonly area: "protocol";
}, {
    readonly id: "security.adapter-boundary-injection";
    readonly area: "security";
}, {
    readonly id: "security.oversize-request";
    readonly area: "security";
}, {
    readonly id: "security.cross-cube-isolation";
    readonly area: "security";
}, {
    readonly id: "log.read-cursor-tuple";
    readonly area: "cursor";
}, {
    readonly id: "sse.replay-live-transition";
    readonly area: "sse";
}, {
    readonly id: "cursor.explicit-expiry";
    readonly area: "cursor";
}, {
    readonly id: "acks.idempotent";
    readonly area: "acks";
}, {
    readonly id: "claims.durable-noncursor";
    readonly area: "claims";
}, {
    readonly id: "decisions.topic-supersession";
    readonly area: "decisions";
}, {
    readonly id: "capabilities.unsupported-fails-closed";
    readonly area: "capabilities";
}, {
    readonly id: "security.active-stream-revocation";
    readonly area: "security";
}];
export type AdapterConformanceFixtureId = (typeof ADAPTER_CONFORMANCE_FIXTURES)[number]['id'];
export interface AdapterConformanceResult {
    id: AdapterConformanceFixtureId;
    ok: boolean;
    observations: Record<string, unknown>;
    error?: string;
}
export interface AdapterConformanceReport {
    ok: boolean;
    results: AdapterConformanceResult[];
    normalizedTranscript: ReadonlyArray<{
        id: AdapterConformanceFixtureId;
        observations: Record<string, unknown>;
    }>;
}
export interface EquivalentAdapterConformanceReport {
    ok: boolean;
    cloud: AdapterConformanceReport;
    local: AdapterConformanceReport;
    equivalent: boolean;
}
export interface AdapterConformanceOptions {
    streamDeadlineMs?: number;
    pendingProbeMs?: number;
}
export declare function runAdapterConformance(environment: ConformanceEnvironment, options?: AdapterConformanceOptions): Promise<AdapterConformanceReport>;
export declare function runEquivalentAdapterConformance(cloud: ConformanceEnvironment, local: ConformanceEnvironment, options?: AdapterConformanceOptions): Promise<EquivalentAdapterConformanceReport>;
//# sourceMappingURL=adapter.d.ts.map