/** Current Borg coordination protocol generation. */
export const PROTOCOL_VERSION = '1' as const;

/** Protocol generations accepted by this package release. */
export const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION] as const;

export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export interface CompatibilityEntry {
  packageRange: string;
  protocolVersions: readonly ProtocolVersion[];
  notes: string;
}

/**
 * Compatibility table for published package releases. Pre-1.0 package
 * releases may add contracts, but do not change an existing wire shape without
 * a documented migration path.
 */
export const COMPATIBILITY_MATRIX: readonly CompatibilityEntry[] = [
  {
    packageRange: '>=0.2.0 <0.3.0',
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    notes: 'Versioned envelope, codecs, and adapter conformance for Borg MCP servers.',
  },
];

export function isProtocolVersionSupported(value: unknown): value is ProtocolVersion {
  return typeof value === 'string' &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}
