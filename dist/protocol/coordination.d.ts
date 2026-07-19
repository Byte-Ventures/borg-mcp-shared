import { type LogCursor, type ProtocolEnvelope } from './contract.js';
import type { Decision, EnrichedStreamEntry } from './types.js';
export interface ReadLogRequest {
    cursor: LogCursor | null;
    limit?: number;
}
export interface ClaimRecord {
    log_entry_id: string;
    claimant_drone_id: string;
    claimant_label: string | null;
    claimant_role: string | null;
    claimed_at: string;
    stale: boolean;
}
export interface AppendLogResult {
    entry: EnrichedStreamEntry;
}
export interface ReadLogResult {
    entries: EnrichedStreamEntry[];
    cursor: LogCursor | null;
    behind_by: number;
    has_more: boolean;
    claims: ClaimRecord[];
}
export interface ReassignDroneRequest {
    role_id: string;
}
export interface ManagedDrone {
    id: string;
    cube_id: string;
    role_id: string;
    label: string;
}
export interface ReassignDroneResult {
    drone: ManagedDrone;
}
export type EvictDroneRequest = Record<string, never>;
export interface EvictDroneResult {
    drone_id: string;
    evicted: true;
}
export declare function decodeReassignDroneRequest(value: unknown): ReassignDroneRequest;
export declare function decodeReassignDroneRequestEnvelope(value: unknown): ProtocolEnvelope<ReassignDroneRequest>;
export declare function decodeReassignDroneResult(value: unknown): ReassignDroneResult;
export declare function decodeReassignDroneResultEnvelope(value: unknown): ProtocolEnvelope<ReassignDroneResult>;
export declare function decodeEvictDroneRequest(value: unknown): EvictDroneRequest;
export declare function decodeEvictDroneRequestEnvelope(value: unknown): ProtocolEnvelope<EvictDroneRequest>;
export declare function decodeEvictDroneResult(value: unknown): EvictDroneResult;
export declare function decodeEvictDroneResultEnvelope(value: unknown): ProtocolEnvelope<EvictDroneResult>;
export declare function decodeReadLogRequest(value: unknown): ReadLogRequest;
export declare function decodeReadLogRequestEnvelope(value: unknown): ProtocolEnvelope<ReadLogRequest>;
export declare function decodeAppendLogResult(value: unknown): AppendLogResult;
export declare function decodeAppendLogResultEnvelope(value: unknown): ProtocolEnvelope<AppendLogResult>;
export declare function decodeReadLogResult(value: unknown): ReadLogResult;
export declare function decodeReadLogResultEnvelope(value: unknown): ProtocolEnvelope<ReadLogResult>;
export declare function decodeDecision(value: unknown): Decision;
export declare function decodeDecisionResultEnvelope(value: unknown): ProtocolEnvelope<{
    decision: Decision;
}>;
export declare function decodeDecisionsResultEnvelope(value: unknown): ProtocolEnvelope<{
    decisions: Decision[];
}>;
//# sourceMappingURL=coordination.d.ts.map