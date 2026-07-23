import type {
  DroneRuntimeMetadata,
  DroneRuntimeMetadataPatch,
} from './protocol/types.js';

export const RUNTIME_METADATA_LIMITS = {
  reported_model_bytes: 160,
  repo_segment_bytes: 100,
  repo_name_bytes: 201,
  repo_origin_bytes: 512,
} as const;

export type RuntimeMetadataField =
  | 'agent_kind'
  | 'reported_model'
  | 'working_repo_name'
  | 'working_repo_origin';

export class RuntimeMetadataValidationError extends Error {
  constructor(
    public readonly field: RuntimeMetadataField,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = 'RuntimeMetadataValidationError';
  }
}

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]*$/;
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const UNSAFE_UNICODE_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|\p{Bidi_Control}/u;

function byteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

function hasMalformedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function invalid(field: RuntimeMetadataField, reason: string): never {
  throw new RuntimeMetadataValidationError(field, reason);
}

export function validateReportedModel(value: string): string {
  const bytes = byteLength(value);
  if (bytes < 1 || bytes > RUNTIME_METADATA_LIMITS.reported_model_bytes) {
    invalid('reported_model', 'must be 1-160 UTF-8 bytes');
  }
  if (hasMalformedUnicode(value) || UNSAFE_UNICODE_PATTERN.test(value) || !MODEL_PATTERN.test(value)) {
    invalid('reported_model', 'must be a printable model identifier');
  }
  return value;
}

export function validateWorkingRepoName(value: string): string {
  if (byteLength(value) > RUNTIME_METADATA_LIMITS.repo_name_bytes) {
    invalid('working_repo_name', 'must be at most 201 bytes');
  }
  const segments = value.split('/');
  if (
    segments.length !== 2 ||
    segments.some((segment) =>
      segment === '.' ||
      segment === '..' ||
      byteLength(segment) > RUNTIME_METADATA_LIMITS.repo_segment_bytes ||
      !REPO_SEGMENT_PATTERN.test(segment)
    )
  ) {
    invalid('working_repo_name', 'must be a canonical owner/repository name');
  }
  return value;
}

function validatePublicHost(hostname: string): string {
  const host = hostname.toLowerCase();
  if (
    host.length > 253 ||
    !host.includes('.') ||
    host.includes(':') ||
    /^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){1,3}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan)$/.test(host)
  ) {
    invalid('working_repo_origin', 'must use a public DNS host');
  }
  const labels = host.split('.');
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    invalid('working_repo_origin', 'must use a public DNS host');
  }
  return host;
}

function originParts(value: string): { host: string; path: string } {
  if (
    byteLength(value) > RUNTIME_METADATA_LIMITS.repo_origin_bytes ||
    value.includes('%') ||
    hasMalformedUnicode(value) ||
    UNSAFE_UNICODE_PATTERN.test(value) ||
    /[\u0080-\uffff]/u.test(value)
  ) {
    invalid('working_repo_origin', 'must be a safe canonical repository URL');
  }

  const scp = /^git@([^/:]+):(.+)$/.exec(value);
  if (scp) return { host: validatePublicHost(scp[1]), path: scp[2] };

  const hierarchical = /^(https|ssh):\/\/([^/]+)\/(.+)$/.exec(value);
  if (!hierarchical) {
    invalid('working_repo_origin', 'must be an HTTPS or Git SSH repository URL');
  }
  const [, scheme, authority, path] = hierarchical;
  if (path.includes('?') || path.includes('#')) {
    invalid('working_repo_origin', 'must not include a query or fragment');
  }
  if (scheme === 'https') {
    if (authority.includes('@')) {
      invalid('working_repo_origin', 'must not include credentials or a non-default port');
    }
    const hostMatch = /^([^:]+)(?::443)?$/.exec(authority);
    if (!hostMatch) {
      invalid('working_repo_origin', 'must not include credentials or a non-default port');
    }
    return { host: validatePublicHost(hostMatch[1]), path };
  }
  const sshMatch = /^git@([^:]+)(?::22)?$/.exec(authority);
  if (!sshMatch) {
      invalid('working_repo_origin', 'SSH repository URLs require the literal git user');
  }
  return { host: validatePublicHost(sshMatch[1]), path };
}

export interface CanonicalRepositoryIdentity {
  working_repo_name: string;
  working_repo_origin: string;
}

export function canonicalizeRepositoryIdentity(
  inputOrigin: string,
  expectedName?: string,
): CanonicalRepositoryIdentity {
  const { host, path: rawPath } = originParts(inputOrigin);
  const path = rawPath.endsWith('.git') ? rawPath.slice(0, -4) : rawPath;
  if (path.includes('\\') || path.startsWith('/') || path.endsWith('/')) {
    invalid('working_repo_origin', 'must identify exactly one owner/repository path');
  }
  const name = validateWorkingRepoName(path);
  if (expectedName !== undefined && validateWorkingRepoName(expectedName) !== name) {
    invalid('working_repo_name', 'must match the canonical repository origin');
  }
  return {
    working_repo_name: name,
    working_repo_origin: `https://${host}/${name}`,
  };
}

export function validateRuntimeMetadata(metadata: DroneRuntimeMetadata): DroneRuntimeMetadata {
  if (metadata.reported_model !== null) validateReportedModel(metadata.reported_model);
  if ((metadata.working_repo_name === null) !== (metadata.working_repo_origin === null)) {
    invalid('working_repo_name', 'repository name and origin must be set or cleared together');
  }
  if (metadata.working_repo_name !== null && metadata.working_repo_origin !== null) {
    const canonical = canonicalizeRepositoryIdentity(
      metadata.working_repo_origin,
      metadata.working_repo_name,
    );
    return { ...metadata, ...canonical };
  }
  return { ...metadata };
}

export function validateRuntimeMetadataPatch(
  patch: DroneRuntimeMetadataPatch,
): DroneRuntimeMetadataPatch {
  if (patch.reported_model !== undefined && patch.reported_model !== null) {
    validateReportedModel(patch.reported_model);
  }
  const hasName = patch.working_repo_name !== undefined;
  const hasOrigin = patch.working_repo_origin !== undefined;
  if (hasName !== hasOrigin) {
    invalid('working_repo_name', 'repository name and origin must be patched together');
  }
  if (hasName && hasOrigin) {
    const name = patch.working_repo_name;
    const origin = patch.working_repo_origin;
    if ((name === null) !== (origin === null)) {
      invalid('working_repo_name', 'repository name and origin must be set or cleared together');
    }
    if (name !== null && name !== undefined && origin !== null && origin !== undefined) {
      const canonical = canonicalizeRepositoryIdentity(
        origin,
        name,
      );
      return { ...patch, ...canonical };
    }
  }
  return { ...patch };
}
