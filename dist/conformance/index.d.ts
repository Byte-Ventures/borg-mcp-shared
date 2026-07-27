import type { BroadcastHwm } from '../log-stream-hwm.js';
import type { AssociateRepositoryCubeRequest, CreateCubeRequest, EnrollmentExchangeRequest, ResolveRepositoryCubeRequest } from '../protocol/contract.js';
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
export interface AppendLogResultConformanceVector {
    name: string;
    response: unknown;
    accepts: boolean;
}
export declare const APPEND_LOG_RESULT_CONFORMANCE: readonly AppendLogResultConformanceVector[];
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
export interface CreateCubeRetryConformanceVector {
    name: string;
    initial: CreateCubeRequest;
    retry: CreateCubeRequest;
    expected: {
        outcome: 'resolved_response';
        status: 201;
    } | {
        outcome: 'retry_tuple_mismatch';
        status: 409;
        error: 'INVALID_INPUT';
    };
}
export interface CubeTemplateAcceptanceConformanceVector {
    name: string;
    template: unknown;
    accepts: boolean;
}
export declare const CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE: readonly CubeTemplateAcceptanceConformanceVector[];
export declare const CREATE_CUBE_RETRY_CONFORMANCE: readonly CreateCubeRetryConformanceVector[];
export interface CreateCubeAssociationConformanceVector {
    name: string;
    created: CreateCubeRequest;
    request: CreateCubeRequest;
    expected: {
        outcome: 'resolved';
        authority_state_delta: Record<string, never>;
    } | {
        outcome: 'created';
        authority_state_delta: {
            cubes: 1;
            roles: 2;
            grants: 1;
            cube_create_bindings: 1;
            repository_associations: 1;
        };
    };
}
export declare const CREATE_CUBE_ASSOCIATION_CONFORMANCE: readonly CreateCubeAssociationConformanceVector[];
export interface ResolveRepositoryCubeConformanceVector {
    name: string;
    request: ResolveRepositoryCubeRequest;
    associated: boolean;
    expected: {
        outcome: 'none';
        status: 200;
        authority_state_delta: Record<string, never>;
    } | {
        outcome: 'resolved';
        status: 200;
        authority_state_delta: Record<string, never>;
    };
}
export declare const RESOLVE_REPOSITORY_CUBE_CONFORMANCE: readonly ResolveRepositoryCubeConformanceVector[];
export interface AssociateRepositoryCubeConformanceVector {
    name: string;
    initial: AssociateRepositoryCubeRequest;
    retry: AssociateRepositoryCubeRequest;
    expected: {
        outcome: 'resolved';
        status: 200;
        initial_authority_state_delta: {
            repository_associations: 1;
        };
        retry_authority_state_delta: Record<string, never>;
    } | {
        outcome: 'repository_conflict' | 'cube_conflict';
        status: 409;
        error: 'REPOSITORY_ALREADY_ASSOCIATED' | 'CUBE_ALREADY_ASSOCIATED';
        diagnostic_disclosure: 'none';
        retry_authority_state_delta: Record<string, never>;
    };
}
export declare const ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE: readonly AssociateRepositoryCubeConformanceVector[];
export declare const REPOSITORY_CUBE_PERMISSION_CONFORMANCE: readonly [{
    readonly name: "association denies an inaccessible explicit cube without mutation";
    readonly request: {
        readonly working_repo_name: string;
        readonly repository: import("../protocol/contract.js").CreateCubeRepository;
        readonly cube_id: "00000000-0000-4000-8000-000000000131";
    };
    readonly expected: {
        readonly status: 403;
        readonly error: "ACCESS_DENIED";
        readonly authority_state_delta: {};
    };
}, {
    readonly name: "same-client binding to an inaccessible cube is non-enumerating";
    readonly request: {
        readonly working_repo_name: string;
        readonly repository: import("../protocol/contract.js").CreateCubeRepository;
        readonly cube_id: "00000000-0000-4000-8000-000000000131";
    };
    readonly precondition: "repository_bound_to_inaccessible_cube";
    readonly expected: {
        readonly resolve: {
            readonly status: 200;
            readonly outcome: "none";
            readonly authority_state_delta: {};
        };
        readonly associate: {
            readonly status: 403;
            readonly error: "ACCESS_DENIED";
            readonly diagnostic_disclosure: "none";
            readonly authority_state_delta: {};
        };
    };
}, {
    readonly name: "another client binding is neither resolved nor treated as a conflict";
    readonly request: {
        readonly working_repo_name: string;
        readonly repository: import("../protocol/contract.js").CreateCubeRepository;
        readonly cube_id: "00000000-0000-4000-8000-000000000131";
    };
    readonly precondition: "repository_bound_by_another_client";
    readonly expected: {
        readonly resolve: {
            readonly status: 200;
            readonly outcome: "none";
            readonly authority_state_delta: {};
        };
        readonly associate: {
            readonly status: 200;
            readonly outcome: "resolved";
            readonly authority_state_delta: {
                readonly repository_associations: 1;
            };
        };
    };
}];
export declare const REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE: readonly [{
    readonly name: "legacy cube with invalid authoritative roles is rejected without mutation";
    readonly request: {
        readonly working_repo_name: string;
        readonly repository: import("../protocol/contract.js").CreateCubeRepository;
        readonly cube_id: "00000000-0000-4000-8000-000000000131";
    };
    readonly expected: {
        readonly status: 409;
        readonly error: "INVALID_INPUT";
        readonly diagnostic_disclosure: "none";
        readonly authority_state_delta: {};
    };
}];
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
export interface AttachSessionConformanceVector {
    name: string;
    response: unknown;
    accepts: boolean;
}
export declare const ATTACH_SESSION_CONFORMANCE: readonly AttachSessionConformanceVector[];
export interface RuntimeMetadataRepositoryConformanceVector {
    name: string;
    origin: string;
    expected: {
        working_repo_name: string;
        working_repo_origin: string;
    } | null;
}
export declare const RUNTIME_METADATA_REPOSITORY_CONFORMANCE: readonly RuntimeMetadataRepositoryConformanceVector[];
//# sourceMappingURL=index.d.ts.map