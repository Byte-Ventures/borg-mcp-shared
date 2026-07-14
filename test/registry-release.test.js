import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  readWithPropagationRetry,
  verifyProvenanceStatement,
} from '../scripts/verify-registry-release.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const digest = 'ab'.repeat(64);
const integrity = `sha512-${Buffer.from(digest, 'hex').toString('base64')}`;

function statement(path = '.github/workflows/publish.yml') {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{
      name: 'pkg:npm/borgmcp-shared@0.2.2',
      digest: { sha512: digest },
    }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: 'refs/tags/v0.2.2',
            repository: 'https://github.com/Byte-Ventures/borg-mcp-shared',
            path,
          },
        },
        internalParameters: { github: { event_name: 'push' } },
        resolvedDependencies: [{
          uri: 'git+https://github.com/Byte-Ventures/borg-mcp-shared@refs/tags/v0.2.2',
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
  it('retries transient registry 404 responses with bounded backoff', async () => {
    const responses = [{ status: 404 }, { status: 404 }, { status: 200, ok: true }];
    const waits = [];
    const response = await readWithPropagationRetry(
      async () => responses.shift(),
      'Ownership check',
      { attempts: 4, wait: async (milliseconds) => waits.push(milliseconds) },
    );
    expect(response.status).toBe(200);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('fails closed when registry propagation retries are exhausted', async () => {
    let reads = 0;
    const waits = [];
    await expect(readWithPropagationRetry(
      async () => {
        reads += 1;
        return { status: 404 };
      },
      'Provenance bundle verification',
      { attempts: 3, wait: async (milliseconds) => waits.push(milliseconds) },
    )).rejects.toThrow('Provenance bundle verification remained HTTP 404 after 3 attempts.');
    expect(reads).toBe(3);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('does not retry terminal non-404 registry responses', async () => {
    let reads = 0;
    const response = await readWithPropagationRetry(async () => {
      reads += 1;
      return { status: 503 };
    }, 'Ownership check', { attempts: 3, wait: async () => {} });
    expect(response.status).toBe(503);
    expect(reads).toBe(1);
  });

  it('accepts the real npm SLSA v1 GitHub Actions schema', () => {
    expect(() => verifyProvenanceStatement(
      statement(),
      'application/vnd.in-toto+json',
      'borgmcp-shared',
      '0.2.2',
      integrity,
      commit,
    )).not.toThrow();
  });

  it('rejects a noncanonical workflow path', () => {
    expect(() => verifyProvenanceStatement(
      statement('/.github/workflows/publish.yml'),
      'application/vnd.in-toto+json',
      'borgmcp-shared',
      '0.2.2',
      integrity,
      commit,
    )).toThrow(/workflow identity/);
  });

  it.each([
    ['DSSE payload type', 'text/plain', undefined, undefined],
    ['statement type', 'application/vnd.in-toto+json', 'https://in-toto.io/Statement/v0.1', undefined],
    ['predicate type', 'application/vnd.in-toto+json', undefined, 'https://example.invalid/predicate'],
  ])('rejects an invalid signed %s', (_description, payloadType, type, predicateType) => {
    const value = statement();
    if (type) value._type = type;
    if (predicateType) value.predicateType = predicateType;
    expect(() => verifyProvenanceStatement(
      value,
      payloadType,
      'borgmcp-shared',
      '0.2.2',
      integrity,
      commit,
    )).toThrow(/in-toto Statement v1/);
  });
});
