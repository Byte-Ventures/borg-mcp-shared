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
    readonly name: "ordinary enrollment creates no authority or cube state";
    readonly response: {
        readonly purpose: "client";
        readonly client_id: "00000000-0000-4000-8000-000000000111";
        readonly server_capabilities: readonly [];
    };
    readonly expected_state_delta: {
        readonly cubes: 0;
        readonly roles: 0;
        readonly grants: 0;
        readonly server_capabilities: 0;
    };
}, {
    readonly name: "owner enrollment grants create-cube authority without cube state";
    readonly response: {
        readonly purpose: "owner";
        readonly client_id: "00000000-0000-4000-8000-000000000111";
        readonly server_capabilities: readonly ["create_cube"];
    };
    readonly expected_state_delta: {
        readonly cubes: 0;
        readonly roles: 0;
        readonly grants: 0;
        readonly server_capabilities: 1;
    };
}];
export declare const ENROLLMENT_REDACTION_CONFORMANCE: readonly ConformanceVector<string, string>[];
//# sourceMappingURL=index.d.ts.map