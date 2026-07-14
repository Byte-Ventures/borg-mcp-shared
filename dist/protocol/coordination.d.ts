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