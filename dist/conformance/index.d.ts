import type { BroadcastHwm } from '../log-stream-hwm.js';
import type { EnrollmentExchangeRequest } from '../protocol/contract.js';
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
export interface EnrollmentRetryConformanceVector {
    name: string;
    initial: EnrollmentExchangeRequest;
    retry: EnrollmentExchangeRequest;
    expected: {
        outcome: 'stable_non_secret_identity';
        status: 201;
        forbidden_response_fields: readonly [
            'credential',
            'client_credential',
            'invitation',
            'retry_key'
        ];
    } | {
        outcome: 'uniform_auth_invalid';
        status: 401;
        error: 'AUTH_INVALID';
    };
}
export declare const ENROLLMENT_RETRY_CONFORMANCE: readonly EnrollmentRetryConformanceVector[];
export declare const ENROLLMENT_AUTHORITY_CONFORMANCE: readonly [{
    readonly name: "ordinary enrollment creates no grant";
    readonly response: {
        readonly purpose: "client";
        readonly client_id: "00000000-0000-4000-8000-000000000111";
    };
    readonly expected_created_grants: 0;
}, {
    readonly name: "bootstrap claim returns one cube-scoped parent grant and two role identities";
    readonly response: {
        readonly purpose: "bootstrap";
        readonly client_id: "00000000-0000-4000-8000-000000000111";
        readonly cube_id: "00000000-0000-4000-8000-000000000112";
        readonly human_seat_role_id: "00000000-0000-4000-8000-000000000113";
        readonly default_worker_role_id: "00000000-0000-4000-8000-000000000114";
        readonly access: "manage";
    };
    readonly expected_created_grants: 1;
}];
export declare const ENROLLMENT_REDACTION_CONFORMANCE: readonly ConformanceVector<string, string>[];
//# sourceMappingURL=index.d.ts.map