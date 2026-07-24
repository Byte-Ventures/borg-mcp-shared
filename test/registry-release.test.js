import { describe, expect, it } from 'vitest';
import {
  postpublish,
  prepublish,
  readWithPropagationRetry,
} from '../scripts/verify-registry-release.mjs';

describe('registry release verification', () => {
  it('survives registry propagation beyond the former twelve-read window', async () => {
    const responses = [
      ...Array.from({ length: 12 }, () => ({ status: 404 })),
      { status: 200, ok: true },
    ];
    const waits = [];
    const response = await readWithPropagationRetry(
      async () => responses.shift(),
      'Published version verification',
      { wait: async (milliseconds) => waits.push(milliseconds) },
    );
    expect(response.status).toBe(200);
    expect(waits).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      15_000,
      15_000,
      15_000,
      15_000,
      15_000,
      15_000,
      15_000,
      15_000,
    ]);
  });

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
      'Published version verification',
      { attempts: 3, wait: async (milliseconds) => waits.push(milliseconds) },
    )).rejects.toThrow('Published version verification remained HTTP 404 after 3 attempts.');
    expect(reads).toBe(3);
    expect(waits).toEqual([1_000, 2_000]);
  });

  it('fails closed after the full production propagation window', async () => {
    let reads = 0;
    await expect(readWithPropagationRetry(
      async () => {
        reads += 1;
        return { status: 404 };
      },
      'Published version verification',
      { wait: async () => {} },
    )).rejects.toThrow('Published version verification remained HTTP 404 after 18 attempts.');
    expect(reads).toBe(18);
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

  it('rejects an existing immutable version before publish', async () => {
    await expect(prepublish('borgmcp-shared', '0.4.2', {
      expectedOwner: 'byteventures',
      read: async () => new Response('{}', { status: 200 }),
    })).rejects.toThrow('borgmcp-shared@0.4.2 already exists and is immutable');
  });

  it('rejects a wrong package owner before publish', async () => {
    const responses = [
      new Response('', { status: 404 }),
      Response.json({ maintainers: [{ name: 'attacker' }] }),
    ];
    await expect(prepublish('borgmcp-shared', '0.6.1', {
      expectedOwner: 'byteventures',
      read: async () => responses.shift(),
    })).rejects.toThrow('Package is not owned by NPM_EXPECTED_OWNER');
  });

  it('accepts an absent version owned by the configured maintainer', async () => {
    const responses = [
      new Response('', { status: 404 }),
      Response.json({ maintainers: [{ name: 'byteventures' }] }),
    ];
    await expect(prepublish('borgmcp-shared', '0.6.1', {
      expectedOwner: 'byteventures',
      read: async () => responses.shift(),
    })).resolves.toEqual({
      name: 'borgmcp-shared',
      version: '0.6.1',
      registryState: 'owned',
    });
  });

  it('verifies only exact post-publish registry integrity', async () => {
    await expect(postpublish('borgmcp-shared', '0.6.1', 'sha512-expected', {
      read: async () => Response.json({ dist: { integrity: 'sha512-expected' } }),
      retry: { wait: async () => {} },
    })).resolves.toEqual({
      name: 'borgmcp-shared',
      version: '0.6.1',
      integrity: 'sha512-expected',
      registryState: 'verified',
    });

    await expect(postpublish('borgmcp-shared', '0.6.1', 'sha512-expected', {
      read: async () => Response.json({ dist: { integrity: 'sha512-wrong' } }),
      retry: { wait: async () => {} },
    })).rejects.toThrow('Registry integrity mismatch');
  });
});
