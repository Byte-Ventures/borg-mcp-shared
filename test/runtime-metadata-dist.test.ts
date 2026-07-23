import { describe, expect, it } from 'vitest';
import {
  RuntimeMetadataValidationError,
  validateRuntimeMetadata,
  validateRuntimeMetadataPatch,
} from '../dist/runtime-metadata.js';

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
});
