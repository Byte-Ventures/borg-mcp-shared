import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import {
  assembleReleaseBody,
  createGithubRelease,
} from '../scripts/create-github-release.mjs';

const commit = 'a'.repeat(40);
const integrity = `sha512-${createHash('sha512').update('release').digest('base64')}`;
const releaseNotes = 'Protocol v9 release notes from the tagged commit.';

function authorities(overrides = {}) {
  return {
    git: (_root: string, args: string[]) => {
      if (args[0] === 'cat-file') return 'tag';
      if (args[0] === 'rev-parse') return commit;
      if (args[0] === 'for-each-ref') return 'borgmcp-shared 1.2.3';
      return '';
    },
    gitFile: (_root: string, ref: string, path: string) => {
      expect(ref).toBe(commit);
      expect(path).toBe('docs/releases/1.2.3.md');
      return releaseNotes;
    },
    postpublish: vi.fn(async () => ({
      name: 'borgmcp-shared', version: '1.2.3', integrity, registryState: 'verified',
    })),
    request: vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 })),
    ...overrides,
  };
}

describe('GitHub Release operator', () => {
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

  it('assembles release facts with exact tagged notes', () => {
    expect(assembleReleaseBody({
      packageName: 'borgmcp-shared', version: '1.2.3', integrity,
      tag: 'v1.2.3', commit, releaseNotes,
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
      '## News and fixes',
      '',
      releaseNotes,
    ].join('\n'));
  });

  it.each([
    ['missing', () => { throw new Error('missing tagged notes'); }],
    ['blank', () => '   \n'],
  ])('fails closed when tagged release notes are %s', async (_case, taggedNotes) => {
    const system = authorities({
      gitFile: () => taggedNotes(),
    });
    await expect(createGithubRelease('1.2.3', integrity, {
      token: 'test-token', authorities: system,
    })).rejects.toThrow();
    expect(system.request).not.toHaveBeenCalled();
    expect(system.postpublish).not.toHaveBeenCalled();
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
