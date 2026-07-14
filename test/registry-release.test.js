import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { verifyProvenanceStatement } from '../scripts/verify-registry-release.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const digest = 'ab'.repeat(64);
const integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;

function statement(path = '.github/workflows/publish.yml') {
  return {
    subject: [{
      name: 'pkg:npm/borgmcp-shared@0.2.0',
      digest: { sha512: digest },
    }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: 'refs/tags/v0.2.0',
            repository: 'https://github.com/Byte-Ventures/borg-mcp-shared',
            path,
          },
        },
        internalParameters: { github: { event_name: 'push' } },
        resolvedDependencies: [{
          uri: 'git+https://github.com/Byte-Ventures/borg-mcp-shared@refs/tags/v0.2.0',
          digest: { gitCommit: commit },
        }],
      },
      runDetails: {
        builder: { id: 'https://github.com/actions/runner/github-hosted' },
      },
    },
  };
}

describe('registry provenance verification', () => {
  it('accepts the real npm SLSA v1 GitHub Actions schema', () => {
    expect(() => verifyProvenanceStatement(
      statement(),
      'borgmcp-shared',
      '0.2.0',
      integrity,
      commit,
    )).not.toThrow();
  });

  it('rejects a noncanonical workflow path', () => {
    expect(() => verifyProvenanceStatement(
      statement('/.github/workflows/publish.yml'),
      'borgmcp-shared',
      '0.2.0',
      integrity,
      commit,
    )).toThrow(/workflow identity/);
  });
});
