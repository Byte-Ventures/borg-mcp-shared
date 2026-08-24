import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { prepareRelease, verifyReleaseIdentity } from '../scripts/release-identity.mjs';

const directories: string[] = [];
const carriers = [
  'scripts/verify-packed-artifact.mjs',
  'src/protocol/contract.ts',
  'test/packed-artifact.test.ts',
  'test/protocol-contract.test.ts',
];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe('release identity', () => {
  it('prepares current version carriers without historical release authorities', async () => {
    const root = await createFixture();

    await expect(prepareRelease(root, '1.2.0')).resolves.toMatchObject({
      oldVersion: '1.1.0',
      newVersion: '1.2.0',
    });

    expect(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version).toBe('1.2.0');
    expect(JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8')).packages[''].version).toBe('1.2.0');
    for (const path of carriers) {
      expect(await readFile(join(root, path), 'utf8')).toContain('1.2.0');
    }
  });

  it('verifies current carrier parity and nonblank notes without a release ledger', async () => {
    const root = await createFixture();
    const base = git(root, 'rev-parse', 'HEAD');
    await prepareRelease(root, '1.2.0');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'prepare 1.2.0');
    const candidate = git(root, 'rev-parse', 'HEAD');

    expect(verifyReleaseIdentity(root, base, candidate)).toMatchObject({
      base,
      candidate,
      oldVersion: '1.1.0',
      newVersion: '1.2.0',
      paths: expect.arrayContaining(['docs/releases/1.2.0.md']),
    });
  });

  it('rejects stale carriers and missing or blank notes', async () => {
    const root = await createFixture();
    const base = git(root, 'rev-parse', 'HEAD');
    await prepareRelease(root, '1.2.0');
    await writeFile(join(root, carriers[0]), "export const version = '1.1.0';\n");
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'stale carrier');
    expect(() => verifyReleaseIdentity(root, base, git(root, 'rev-parse', 'HEAD')))
      .toThrow(/carrier is stale/);

    const notesRoot = await createFixture();
    const notesBase = git(notesRoot, 'rev-parse', 'HEAD');
    await prepareRelease(notesRoot, '1.2.0');
    await writeFile(join(notesRoot, 'docs/releases/1.2.0.md'), '  \n');
    git(notesRoot, 'add', '.');
    git(notesRoot, 'commit', '-m', 'blank notes');
    expect(() => verifyReleaseIdentity(notesRoot, notesBase, git(notesRoot, 'rev-parse', 'HEAD')))
      .toThrow(/Release notes are blank/);
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'borgmcp-shared-release-identity-'));
  directories.push(root);
  for (const directory of ['scripts', 'src/protocol', 'test', 'docs/releases']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, 'package.json'), `${JSON.stringify({
    name: 'borgmcp-shared', version: '1.1.0', type: 'module',
  }, null, 2)}\n`);
  await writeFile(join(root, 'package-lock.json'), `${JSON.stringify({
    name: 'borgmcp-shared', version: '1.1.0', lockfileVersion: 3,
    packages: { '': { name: 'borgmcp-shared', version: '1.1.0' } },
  }, null, 2)}\n`);
  for (const path of carriers) {
    await writeFile(join(root, path), "export const version = '1.1.0';\n");
  }
  await writeFile(join(root, 'docs/releases/1.2.0.md'), 'Release notes for 1.2.0.\n');
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Release Test');
  git(root, 'config', 'user.email', 'release-test@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
