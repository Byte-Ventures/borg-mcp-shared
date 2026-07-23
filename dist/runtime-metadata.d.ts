import type { DroneRuntimeMetadata, DroneRuntimeMetadataPatch } from './protocol/types.js';
export declare const RUNTIME_METADATA_LIMITS: {
    readonly reported_model_bytes: 160;
    readonly repo_segment_bytes: 100;
    readonly repo_name_bytes: 201;
    readonly repo_origin_bytes: 512;
};
export type RuntimeMetadataField = 'runtime_metadata' | 'runtime_metadata_reported' | 'agent_kind' | 'reported_model' | 'working_repo_name' | 'working_repo_origin';
export declare class RuntimeMetadataValidationError extends Error {
    readonly field: RuntimeMetadataField;
    readonly reason: string;
    constructor(field: RuntimeMetadataField, reason: string);
}
export declare function validateReportedModel(value: string): string;
export declare function validateWorkingRepoName(value: string): string;
export interface CanonicalRepositoryIdentity {
    working_repo_name: string;
    working_repo_origin: string;
}
export declare function canonicalizeRepositoryIdentity(inputOrigin: string, expectedName?: string): CanonicalRepositoryIdentity;
export declare function validateRuntimeMetadata(value: unknown): DroneRuntimeMetadata;
export declare function validateRuntimeMetadataPatch(value: unknown): DroneRuntimeMetadataPatch;
export interface ValidatedRuntimeMetadataReportState {
    runtime_metadata: DroneRuntimeMetadata;
    runtime_metadata_reported: boolean;
}
export declare function validateRuntimeMetadataReportState(metadataValue: unknown, reportedValue: unknown): ValidatedRuntimeMetadataReportState;
//# sourceMappingURL=runtime-metadata.d.ts.map