import type { EnrichedStreamEntry } from './types.js';
import { type LogCursor } from './contract.js';
export declare const SSE_LIMITS: {
    readonly total_bytes: number;
    readonly frame_bytes: 65536;
    readonly data_bytes: 65536;
    readonly frame_count: 1000;
    readonly unknown_data_bytes: 4096;
};
export type StreamEvent = {
    type: 'log';
    cursor: LogCursor;
    entry: EnrichedStreamEntry;
} | {
    type: 'ack';
    log_entry_id: string;
    actor_drone_id: string;
    occurred_at: string;
} | {
    type: 'claim';
    log_entry_id: string;
    actor_drone_id: string;
    occurred_at: string;
} | {
    type: 'heartbeat';
    at: string;
    broadcast_hwm: LogCursor | null;
} | {
    type: 'bookmark';
    as_of: string;
    replay_complete: boolean;
    next_cursor?: LogCursor;
    cursor_status?: 'valid' | 'expired' | 'unknown';
} | {
    type: 'unknown';
    event: string;
    raw_data: string;
};
export declare function decodeEnrichedStreamEntry(value: unknown): EnrichedStreamEntry;
export declare function encodeSseEvent(event: Exclude<StreamEvent, {
    type: 'unknown';
}>): string;
export declare function decodeSseFrames(input: string): StreamEvent[];
//# sourceMappingURL=sse.d.ts.map