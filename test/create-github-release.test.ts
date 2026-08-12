import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import {
  assembleReleaseBody,
  assertReleasePullRequest,
  createGithubRelease,
} from '../scripts/create-github-release.mjs';

const commit = 'a'.repeat(40);
const integrity = `sha512-${createHash('sha512').update('release').digest('base64')}`;
const pullRequest = {
  number: 42,
  state: 'closed',
  merged_at: '2026-08-12T00:00:00Z',
  base: { ref: 'main' },
  head: { ref: 'release/1.2.3' },
  merge_commit_sha: commit,
  html_url: 'https://github.com/Byte-Ventures/borg-mcp-shared/pull/42',
  body: '## Summary\n\nShipped exactly this.',
};

function authorities(overrides = {}) {
  return {
    git: (_root: string, args: string[]) => {
      if (args[0] === 'cat-file') return 'tag';
      if (args[0] === 'rev-parse') return commit;
      if (args[0] === 'for-each-ref') return 'borgmcp-shared 1.2.3';
      return 'Merge pull request #42 from Byte-Ventures/release/1.2.3';
    },
    githubApi: (_root: string, endpoint: string) => endpoint.includes('/pulls')
      ? [pullRequest]
      : { workflow_runs: [{
          id: 123,
          path: '.github/workflows/publish.yml',
          head_sha: commit,
          head_branch: 'v1.2.3',
          run_attempt: 1,
          status: 'completed',
          conclusion: 'success',
        }] },
    postpublish: vi.fn(async () => ({
      name: 'borgmcp-shared', version: '1.2.3', integrity, registryState: 'verified',
    })),
    request: vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 })),
    ...overrides,
  };
}

const successfulRun = {
  id: 123,
  path: '.github/workflows/publish.yml',
  head_sha: commit,
  head_branch: 'v1.2.3',
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
};

describe('GitHub Release operator', () => {
  it('accepts the release PR bound to the tagged merge commit', () => {
    expect(assertReleasePullRequest(
      [pullRequest], '1.2.3', commit,
      'Merge pull request #42 from Byte-Ventures/release/1.2.3',
    )).toBe(pullRequest);
  });

  it.each([
    ['multiple PRs', [pullRequest, { ...pullRequest, number: 43 }], 'exactly one'],
    ['open PR', [{ ...pullRequest, state: 'open' }], 'closed and merged'],
    ['unmerged PR', [{ ...pullRequest, merged_at: null }], 'closed and merged'],
    ['wrong base', [{ ...pullRequest, base: { ref: 'develop' } }], 'base main'],
    ['wrong head', [{ ...pullRequest, head: { ref: 'release/1.2.4' } }], 'head release/1.2.3'],
    ['wrong merge commit', [{ ...pullRequest, merge_commit_sha: 'b'.repeat(40) }], 'tagged commit'],
  ])('rejects %s', (_case, pullRequests, message) => {
    expect(() => assertReleasePullRequest(
      pullRequests, '1.2.3', commit,
      'Merge pull request #42 from Byte-Ventures/release/1.2.3',
    )).toThrow(message);
  });

  it('rejects a local merge subject that names another PR', () => {
    expect(() => assertReleasePullRequest(
      [pullRequest], '1.2.3', commit,
      'Merge pull request #41 from Byte-Ventures/release/1.2.3',
    )).toThrow('local merge subject');
  });

  it('rejects a lightweight release tag', async () => {
    const system = authorities({
      git: (_root: string, args: string[]) => args[0] === 'cat-file' ? 'commit' : '',
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow('not annotated');
  });

  it('rejects an annotated release tag with an empty message', async () => {
    const system = authorities({
      git: (_root: string, args: string[]) => {
        if (args[0] === 'cat-file') return 'tag';
        if (args[0] === 'rev-parse') return commit;
        return '';
      },
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow('no message');
  });

  it.each([
    ['wrong workflow path', { ...successfulRun, path: '.github/workflows/ci.yml' }],
    ['wrong head SHA', { ...successfulRun, head_sha: 'b'.repeat(40) }],
    ['wrong tag branch', { ...successfulRun, head_branch: 'v1.2.4' }],
    ['later attempt', { ...successfulRun, run_attempt: 2 }],
    ['incomplete run', { ...successfulRun, status: 'in_progress' }],
    ['failed run', { ...successfulRun, conclusion: 'failure' }],
  ])('rejects a release run with %s', async (_case, run) => {
    const system = authorities({
      githubApi: (_root: string, endpoint: string) => endpoint.includes('/pulls')
        ? [pullRequest]
        : { workflow_runs: [run] },
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow('exactly one successful attempt-1');
  });

  it.each([
    ['zero', []],
    ['multiple', [successfulRun, { ...successfulRun, id: 124 }]],
  ])('rejects %s matching release runs', async (_case, runs) => {
    const system = authorities({
      githubApi: (_root: string, endpoint: string) => endpoint.includes('/pulls')
        ? [pullRequest]
        : { workflow_runs: runs },
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow('exactly one successful attempt-1');
  });

  it('assembles framed evidence and preserves the merged PR body verbatim', () => {
    expect(assembleReleaseBody({
      packageName: 'borgmcp-shared', version: '1.2.3', integrity,
      tag: 'v1.2.3', commit, pullRequest,
    })).toBe([
      '## Package',
      '',
      '- Registry: https://www.npmjs.com/package/borgmcp-shared/v/1.2.3',
      `- Live integrity: \`${integrity}\``,
      '- Published through npm Trusted Publishing with provenance.',
      '',
      '## Source',
      '',
      '- Tag: https://github.com/Byte-Ventures/borg-mcp-shared/releases/tag/v1.2.3',
      `- Commit: https://github.com/Byte-Ventures/borg-mcp-shared/commit/${commit}`,
      '- Pull request: https://github.com/Byte-Ventures/borg-mcp-shared/pull/42',
      '',
      '## Release PR body (as merged)',
      '',
      pullRequest.body,
    ].join('\n'));
  });

  it.each([undefined, '', 'sha256-not-accepted', `sha512-${'A'.repeat(85)}==`])(
    'rejects missing or malformed integrity %s',
    async (candidate) => {
      await expect(createGithubRelease('1.2.3', candidate as string, {
        token: 'test-token', authorities: authorities(),
      })).rejects.toThrow('canonical sha512 integrity');
    },
  );

  it('passes the operator-supplied integrity to npm-live before creating the release', async () => {
    const system = authorities();
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).resolves.toEqual({ id: 1 });
    expect(system.postpublish).toHaveBeenCalledWith('borgmcp-shared', '1.2.3', integrity);
    expect(system.request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(system.request.mock.calls[1][1].body as string)).toMatchObject({
      tag_name: 'v1.2.3', name: 'borgmcp-shared 1.2.3', make_latest: 'true',
    });
  });

  it('does not query or create a GitHub Release when npm-live integrity mismatches', async () => {
    const system = authorities({
      postpublish: vi.fn().mockRejectedValue(new Error('Registry integrity mismatch')),
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow('Registry integrity mismatch');
    expect(system.request).not.toHaveBeenCalled();
  });

  it('refuses to post when the GitHub Release already exists', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: authorities({ request }),
    })).rejects.toThrow('already exists');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('pins the exact post-approval operator command in the runbook', async () => {
    const runbook = await readFile('docs/releasing.md', 'utf8');
    expect(runbook).toContain(
      'GITHUB_TOKEN="$(gh auth token)" node scripts/create-github-release.mjs <version> --integrity <sha512-SRI>',
    );
  });

  it.each([
    ['missing flag and integrity', ['1.2.3']],
    ['missing integrity value', ['1.2.3', '--integrity']],
    ['wrong flag', ['1.2.3', '--sri', integrity]],
    ['extra argument', ['1.2.3', '--integrity', integrity, 'extra']],
  ])('rejects CLI grammar with %s', (_case, args) => {
    const result = spawnSync(process.execPath, ['scripts/create-github-release.mjs', ...args], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Usage: node scripts/create-github-release.mjs <version> --integrity <sha512-SRI>',
    );
  });
});
