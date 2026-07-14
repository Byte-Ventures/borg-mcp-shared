import type { BroadcastHwm } from '../log-stream-hwm.js';
export * from './adapter.js';
export interface ConformanceVector<Input, Output> {
    name: string;
    input: Input;
    expected: Output;
}
export interface BroadcastHwmComparisonInput {
    a: BroadcastHwm;
    b: BroadcastHwm;
}
export declare const BROADCAST_HWM_CONFORMANCE: readonly ConformanceVector<BroadcastHwmComparisonInput, -1 | 0 | 1>[];
export declare const DRONE_ADDRESS_CONFORMANCE: readonly ConformanceVector<string, string>[];
export declare const ROLE_SECTION_ROUND_TRIP_CONFORMANCE: readonly string[];
//# sourceMappingURL=index.d.ts.map