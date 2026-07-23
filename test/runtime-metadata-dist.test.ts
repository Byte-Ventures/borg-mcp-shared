import { describe, expect, it } from 'vitest';
import {
  RuntimeMetadataValidationError,
  validateRuntimeMetadata,
  validateRuntimeMetadataPatch,
  validateRuntimeMetadataReportState,
} from '../dist/runtime-metadata.js';
import {
  createProtocolEnvelope,
  decodeAttachResponse,
  decodeDroneRuntimeMetadataState,
  decodeUpdateDroneRuntimeMetadataResponseEnvelope,
  decodeWhoAmIRuntimeMetadataState,
} from '../dist/protocol/contract.js';

const valid = {
  agent_kind: 'opencode',
  reported_model: null,
  working_repo_name: null,
  working_repo_origin: null,
} as const;

describe('committed runtime metadata distribution', () => {
  it('rejects invalid enum and authority keys at the exported runtime boundary', () => {
    expect(() => validateRuntimeMetadata({ ...valid, agent_kind: 'EVIL' })).toThrow(
      RuntimeMetadataValidationError,
    );
    expect(() => validateRuntimeMetadata({ ...valid, authority: 'manage' })).toThrow(
      RuntimeMetadataValidationError,
    );
    expect(() => validateRuntimeMetadataPatch({ agent_kind: 'EVIL' })).toThrow(
      RuntimeMetadataValidationError,
    );
    expect(() => validateRuntimeMetadataPatch({ grants: ['manage'] })).toThrow(
      RuntimeMetadataValidationError,
    );
  });

  it('rejects contradictory unreported response states in committed dist', () => {
    const allNull = {
      agent_kind: null,
      reported_model: null,
      working_repo_name: null,
      working_repo_origin: null,
    };
    const invalidStates = [
      { ...valid, agent_kind: 'codex' },
      { ...valid, reported_model: 'gpt-5' },
      { ...valid, working_repo_name: 'owner/repo' },
      { ...valid, working_repo_origin: 'https://github.com/owner/repo' },
      {
        agent_kind: 'codex',
        reported_model: 'gpt-5',
        working_repo_name: 'owner/repo',
        working_repo_origin: 'https://github.com/owner/repo',
      },
    ];
    for (const metadata of invalidStates) {
      expect(() => validateRuntimeMetadataReportState(metadata, false)).toThrow();
      expect(() => decodeUpdateDroneRuntimeMetadataResponseEnvelope(createProtocolEnvelope(
        'dist-false-known',
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
    expect(() => decodeAttachResponse({
      result: 'created',
      cube: { id: '10000000-0000-4000-8000-000000000001', name: 'test' },
      role: { id: '20000000-0000-4000-8000-000000000001', name: 'Builder' },
      drone: {
        id: '30000000-0000-4000-8000-000000000001',
        label: 'builder-one',
        runtime_metadata: invalidStates[4],
        runtime_metadata_reported: false,
      },
      session: { id: '40000000-0000-4000-8000-000000000001' },
    })).toThrow();

    expect(validateRuntimeMetadataReportState(allNull, false).runtime_metadata_reported).toBe(false);
    expect(validateRuntimeMetadataReportState(allNull, true).runtime_metadata_reported).toBe(true);
    expect(validateRuntimeMetadataReportState(invalidStates[4], true).runtime_metadata_reported).toBe(true);
  });
});
