import { describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  RuntimeMetadataValidationError,
  SELF_RUNTIME_METADATA_PATH,
  canonicalizeRepositoryIdentity,
  createProtocolEnvelope,
  decodeAttachRequest,
  decodeAttachResponse,
  decodeDroneRuntimeMetadata,
  decodeDroneRuntimeMetadataPatch,
  decodeDroneRuntimeMetadataState,
  decodeUpdateDroneRuntimeMetadataRequestEnvelope,
  decodeUpdateDroneRuntimeMetadataResponseEnvelope,
  decodeWhoAmIRuntimeMetadataState,
  validateReportedModel,
  validateRuntimeMetadata,
  validateRuntimeMetadataPatch,
  validateRuntimeMetadataReportState,
  validateWorkingRepoName,
} from '../src/index.js';

const knownMetadata = {
  agent_kind: 'opencode',
  reported_model: 'openai/gpt-5.6-sol',
  working_repo_name: 'Byte-Ventures/borg-mcp',
  working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
} as const;

const attachRequest = {
  cube_id: '10000000-0000-4000-8000-000000000001',
  role_id: '20000000-0000-4000-8000-000000000001',
  session_credential: 'a'.repeat(43),
};

describe('runtime metadata contract', () => {
  it('keeps the own-seat update route free of target identifiers', () => {
    expect(SELF_RUNTIME_METADATA_PATH).toBe('/api/cubes/:cubeId/drones/self/metadata');
    expect(SELF_RUNTIME_METADATA_PATH).not.toContain(':droneId');
  });

  it('accepts only the exact agent kind enum or null', () => {
    for (const agent_kind of ['claude', 'codex', 'opencode', null] as const) {
      expect(decodeDroneRuntimeMetadata({ ...knownMetadata, agent_kind }).agent_kind).toBe(agent_kind);
    }
    for (const agent_kind of ['Claude', ' opencode', '', 1, true, [], {}]) {
      expect(() => decodeDroneRuntimeMetadata({ ...knownMetadata, agent_kind })).toThrow();
    }
  });

  it('enforces reported model byte boundaries and printable identifier syntax', () => {
    for (const size of [1, 159, 160]) expect(validateReportedModel('a'.repeat(size))).toHaveLength(size);
    for (const value of [
      '',
      'a'.repeat(161),
      'model name',
      'safe\u001b[2J',
      'safe\rnext',
      'safe\nnext',
      `safe\u061cnext`,
      `safe\u2028next`,
      '\ud800',
    ]) {
      expect(() => validateReportedModel(value)).toThrow(RuntimeMetadataValidationError);
    }
  });

  it('enforces canonical owner/repository names at segment and total boundaries', () => {
    const segment100 = `a${'b'.repeat(98)}c`;
    expect(validateWorkingRepoName(`${segment100}/${segment100}`)).toHaveLength(201);
    for (const value of [
      '', 'owner', 'owner/', '/repo', 'owner/repo/extra', './repo', '../repo',
      'owner/.', 'owner/..', 'owner/re%70o', `${'a'.repeat(101)}/repo`,
    ]) {
      expect(() => validateWorkingRepoName(value)).toThrow(RuntimeMetadataValidationError);
    }
  });

  it('canonicalizes equivalent HTTPS, SSH URL, and SCP repository identities without network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const expected = {
      working_repo_name: 'Byte-Ventures/borg-mcp',
      working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
    };
    for (const origin of [
      'https://GITHUB.com:443/Byte-Ventures/borg-mcp.git',
      'ssh://git@github.com:22/Byte-Ventures/borg-mcp.git',
      'git@github.com:Byte-Ventures/borg-mcp.git',
    ]) {
      expect(canonicalizeRepositoryIdentity(origin)).toEqual(expected);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects credential, query, fragment, local, private, malformed, and traversal origins', () => {
    const hostile = [
      'https://user@github.com/owner/repo',
      'https://user:secret@github.com/owner/repo',
      'ssh://owner@github.com/owner/repo',
      'https://github.com:444/owner/repo',
      'https://github.com/owner/repo?token=secret',
      'https://github.com/owner/repo#secret',
      'https://github.com/owner/re%70o',
      'https://github.com/owner/../repo',
      'file:///Users/x/repo',
      '/Users/x/repo', '~/repo', './repo', '../repo', 'C:\\repo', '\\\\server\\share',
      'localhost/owner/repo',
      'https://localhost/owner/repo',
      'https://host.local/owner/repo',
      'https://host.internal/owner/repo',
      'https://host.lan/owner/repo',
      'https://127.0.0.1/owner/repo',
      'https://127.1/owner/repo',
      'https://0x7f.0.0.1/owner/repo',
      'https://[::1]/owner/repo',
      'https://-bad.example/owner/repo',
      `https://github.com/owner/repo\u001b[2J`,
      `https://github.com/owner/repo\u061c`,
      `https://github.com/${'a'.repeat(513)}/repo`,
    ];
    for (const origin of hostile) {
      expect(() => canonicalizeRepositoryIdentity(origin), origin).toThrow(
        RuntimeMetadataValidationError,
      );
    }
  });

  it('requires complete attach reports, canonicalizes them, and returns canonical current metadata', () => {
    expect(decodeAttachRequest(attachRequest)).toEqual(attachRequest);
    expect(decodeAttachRequest({
      ...attachRequest,
      runtime_metadata: {
        ...knownMetadata,
        working_repo_origin: 'git@github.com:Byte-Ventures/borg-mcp.git',
      },
    }).runtime_metadata).toEqual(knownMetadata);
    expect(() => decodeAttachRequest({
      ...attachRequest,
      runtime_metadata: { ...knownMetadata, reported_model: undefined },
    })).toThrow();

    const response = {
      result: 'reused',
      cube: { id: attachRequest.cube_id, name: 'test' },
      role: { id: attachRequest.role_id, name: 'Builder' },
      drone: {
        id: '30000000-0000-4000-8000-000000000001',
        label: 'builder-one',
        runtime_metadata: knownMetadata,
        runtime_metadata_reported: true,
      },
      session: { id: '40000000-0000-4000-8000-000000000001' },
    } as const;
    expect(decodeAttachResponse(response).drone.runtime_metadata).toEqual(knownMetadata);
  });

  it('decodes exact atomic patches with omitted, null, and replacement semantics', () => {
    expect(decodeDroneRuntimeMetadataPatch({ reported_model: null })).toEqual({ reported_model: null });
    expect(decodeDroneRuntimeMetadataPatch({ agent_kind: 'codex' })).toEqual({ agent_kind: 'codex' });
    expect(decodeDroneRuntimeMetadataPatch({
      working_repo_name: knownMetadata.working_repo_name,
      working_repo_origin: 'ssh://git@github.com/Byte-Ventures/borg-mcp.git',
    })).toEqual({
      working_repo_name: knownMetadata.working_repo_name,
      working_repo_origin: knownMetadata.working_repo_origin,
    });
    for (const patch of [
      {},
      { cube_id: attachRequest.cube_id },
      { drone_id: '30000000-0000-4000-8000-000000000001' },
      { role_id: attachRequest.role_id },
      { grants: [] },
      { last_seen: '2026-01-01T00:00:00Z' },
      { working_repo_name: knownMetadata.working_repo_name },
      { working_repo_origin: knownMetadata.working_repo_origin },
      { working_repo_name: null, working_repo_origin: knownMetadata.working_repo_origin },
      {
        agent_kind: 'claude',
        working_repo_name: 'other/repo',
        working_repo_origin: knownMetadata.working_repo_origin,
      },
    ]) {
      expect(() => decodeDroneRuntimeMetadataPatch(patch), JSON.stringify(patch)).toThrow();
    }
  });

  it('makes exported whole-object validators exact runtime boundaries', () => {
    expect(validateRuntimeMetadata(knownMetadata)).toEqual(knownMetadata);
    expect(validateRuntimeMetadataPatch({ agent_kind: null })).toEqual({ agent_kind: null });
    for (const value of [
      null,
      [],
      new (class Metadata { agent_kind = 'opencode'; })(),
      { ...knownMetadata, agent_kind: 'EVIL' },
      { ...knownMetadata, authority: 'manage' },
      { ...knownMetadata, reported_model: undefined },
    ]) {
      expect(() => validateRuntimeMetadata(value)).toThrow(RuntimeMetadataValidationError);
    }
    for (const value of [
      null,
      [],
      {},
      { agent_kind: 'EVIL' },
      { agent_kind: null, grants: ['manage'] },
    ]) {
      expect(() => validateRuntimeMetadataPatch(value)).toThrow(RuntimeMetadataValidationError);
    }
    const accessor = { ...knownMetadata } as Record<string, unknown>;
    Object.defineProperty(accessor, 'agent_kind', { get: () => 'opencode', enumerable: true });
    expect(() => validateRuntimeMetadata(accessor)).toThrow(RuntimeMetadataValidationError);
  });

  it('rejects hostile unknown keys without echoing key material', () => {
    const keys = [
      'SECRET-METADATA-KEY-MARKER',
      `control\u001b[2J`,
      `bidi\u061cmarker`,
      `token_${'a'.repeat(48)}`,
    ];
    for (const key of keys) {
      try {
        decodeDroneRuntimeMetadataPatch({ [key]: 'x' });
      } catch (error) {
        expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(key);
        expect(error).toMatchObject({ path: ['runtime_metadata'] });
        continue;
      }
      throw new Error('expected unknown metadata key rejection');
    }
    const versionMarker = keys[0];
    try {
      decodeUpdateDroneRuntimeMetadataRequestEnvelope({
        protocol_version: '2',
        request_id: 'metadata-key-version',
        payload: { [versionMarker]: 'x' },
      });
    } catch (error) {
      expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(versionMarker);
      expect(error).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL_VERSION' });
      return;
    }
    throw new Error('expected version-first unknown-key rejection');
  });

  it('binds the reported flag to one truthful response state', () => {
    const allNull = {
      agent_kind: null,
      reported_model: null,
      working_repo_name: null,
      working_repo_origin: null,
    };
    expect(validateRuntimeMetadataReportState(allNull, false)).toEqual({
      runtime_metadata: allNull,
      runtime_metadata_reported: false,
    });
    expect(validateRuntimeMetadataReportState(allNull, true)).toEqual({
      runtime_metadata: allNull,
      runtime_metadata_reported: true,
    });
    expect(validateRuntimeMetadataReportState(knownMetadata, true)).toEqual({
      runtime_metadata: knownMetadata,
      runtime_metadata_reported: true,
    });
    expect(decodeDroneRuntimeMetadataState({
      ...knownMetadata,
      runtime_metadata_reported: true,
      id: 'ignored-by-state-decoder',
    }).runtime_metadata).toEqual(knownMetadata);
    expect(decodeWhoAmIRuntimeMetadataState({
      runtime_metadata: knownMetadata,
      runtime_metadata_reported: true,
      drone_id: 'ignored-by-state-decoder',
    }).runtime_metadata).toEqual(knownMetadata);
    for (const metadata of [
      { ...allNull, agent_kind: 'codex' },
      { ...allNull, reported_model: 'gpt-5' },
      { ...allNull, working_repo_name: 'owner/repo' },
      { ...allNull, working_repo_origin: 'https://github.com/owner/repo' },
      knownMetadata,
    ]) {
      expect(() => validateRuntimeMetadataReportState(metadata, false)).toThrow(
        RuntimeMetadataValidationError,
      );
      expect(() => decodeUpdateDroneRuntimeMetadataResponseEnvelope(createProtocolEnvelope(
        'metadata-false-known',
        { runtime_metadata: metadata, runtime_metadata_reported: false },
      ))).toThrow();
      expect(() => decodeDroneRuntimeMetadataState({
        ...metadata,
        runtime_metadata_reported: false,
      })).toThrow();
      expect(() => decodeWhoAmIRuntimeMetadataState({
        runtime_metadata: metadata,
        runtime_metadata_reported: false,
      })).toThrow();
    }

    const attach = {
      result: 'created',
      cube: { id: attachRequest.cube_id, name: 'test' },
      role: { id: attachRequest.role_id, name: 'Builder' },
      drone: {
        id: '30000000-0000-4000-8000-000000000001',
        label: 'builder-one',
        runtime_metadata: knownMetadata,
        runtime_metadata_reported: false,
      },
      session: { id: '40000000-0000-4000-8000-000000000001' },
    };
    expect(() => decodeAttachResponse(attach)).toThrow();
  });

  it('checks protocol version before hostile update payloads and decodes canonical responses', () => {
    const request = createProtocolEnvelope('metadata-1', { reported_model: 'openai/gpt-5.6-sol' });
    expect(decodeUpdateDroneRuntimeMetadataRequestEnvelope(request)).toEqual(request);
    const response = createProtocolEnvelope('metadata-1', {
      runtime_metadata: knownMetadata,
      runtime_metadata_reported: true,
    });
    expect(decodeUpdateDroneRuntimeMetadataResponseEnvelope(response).payload.runtime_metadata)
      .toEqual(knownMetadata);
    expect(decodeUpdateDroneRuntimeMetadataResponseEnvelope(response).payload.runtime_metadata_reported)
      .toBe(true);
    const marker = 'SECRET-METADATA-MARKER';
    try {
      decodeUpdateDroneRuntimeMetadataRequestEnvelope({
        protocol_version: `${PROTOCOL_VERSION}-next`,
        request_id: 'metadata-1',
        payload: { working_repo_origin: `https://user:${marker}@github.com/owner/repo` },
      });
    } catch (error) {
      expect(String(error)).not.toContain(marker);
      return;
    }
    throw new Error('expected protocol mismatch');
  });

  it('never echoes hostile metadata values in diagnostics', () => {
    const marker = 'SECRET-METADATA-MARKER';
    try {
      decodeDroneRuntimeMetadataPatch({
        working_repo_name: 'owner/repo',
        working_repo_origin: `https://user:${marker}@github.com/owner/repo`,
      });
    } catch (error) {
      expect(String(error)).not.toContain(marker);
      expect(error).toMatchObject({ path: ['working_repo_origin'] });
      return;
    }
    throw new Error('expected hostile origin rejection');
  });
});
