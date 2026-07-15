export const PROTOCOL_VERSION = '1';
export const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION];
export const COMPATIBILITY_MATRIX = [
    {
        packageRange: '>=0.3.0 <0.4.0',
        protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        notes: 'Retry-safe owner enrollment and idempotent multi-cube creation.',
    },
    {
        packageRange: '>=0.2.0 <0.3.0',
        protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
        notes: 'Legacy server-generated enrollment credential response.',
    },
];
export function isProtocolVersionSupported(value) {
    return typeof value === 'string' &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(value);
}
//# sourceMappingURL=version.js.map