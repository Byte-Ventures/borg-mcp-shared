export declare const PROTOCOL_VERSION: "1";
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["1"];
export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];
export interface CompatibilityEntry {
    packageRange: string;
    protocolVersions: readonly ProtocolVersion[];
    notes: string;
}
export declare const COMPATIBILITY_MATRIX: readonly CompatibilityEntry[];
export declare function isProtocolVersionSupported(value: unknown): value is ProtocolVersion;
//# sourceMappingURL=version.d.ts.map