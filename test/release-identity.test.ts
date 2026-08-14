import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createReleaseRecord,
  prepareRelease,
  verifyReleaseIdentity,
  verifyReleaseProvenance,
  type ReleaseAuthorities,
  type ReleaseRecord,
} from '../scripts/release-identity.mjs';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('release identity recovery', () => {
  it('records a failed release without runner-step reconstruction', async () => {
    const fixture = await createFixture();
    const record = createReleaseRecord(fixture.root, {
      version: '1.1.0',
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);

    expect(record).toMatchObject({
      outcome: 'failed-superseded',
      workflow_run_attempt: 1,
      verify_job_id: null,
      publish_job_id: null,
      artifact_integrity: null,
    });

    expect(createReleaseRecord(fixture.root, {
      version: '1.1.0',
      workflowRunId: 200,
      workflowRunAttempt: 2,
      workflowConclusion: 'failure',
    }, { ...fixture.authorities, githubRun: (_root, runId) => ({
      id: runId, run_attempt: 2, head_sha: git(fixture.root, 'rev-parse', 'v1.1.0^{commit}'),
      head_branch: 'v1.1.0', event: 'push', status: 'completed', conclusion: 'failure',
      path: '.github/workflows/publish.yml',
    }) })).toMatchObject({ workflow_run_attempt: 2 });
  });

  it('rejects a failed release when npm contains the version', async () => {
    const fixture = await createFixture();
    const authorities = { ...fixture.authorities, publishedVersions: () => ['1.0.0', '1.1.0'] };
    expect(() => createReleaseRecord(fixture.root, {
      version: '1.1.0', workflowRunId: 200, workflowRunAttempt: 1, workflowConclusion: 'failure',
    }, authorities)).toThrow(/exists in the npm registry/);
  });

  it('prepares a newer version from a verified failed record', async () => {
    const fixture = await createFixture();
    const prepared = await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);

    expect(prepared.record.outcome).toBe('failed-superseded');
    expect(JSON.parse(await readFile(join(fixture.root, 'package.json'), 'utf8')).version).toBe('1.2.0');
    expect(JSON.parse(await readFile(join(fixture.root, 'package-lock.json'), 'utf8')).packages[''].version).toBe('1.2.0');
    expect(await readFile(join(fixture.root, 'test/version-pin.test.ts'), 'utf8')).toContain('1.2.0');
    expect(JSON.parse(await readFile(join(fixture.root, 'docs/release-records.json'), 'utf8'))).toHaveLength(2);
  });

  it.each([
    ['missing', null, /Release notes are missing/],
    ['blank', '   \n', /Release notes are blank/],
  ])('rejects %s target notes before mutating release identity', async (_case, notes, message) => {
    const fixture = await createFixture();
    const notesPath = join(fixture.root, 'docs/releases/1.2.0.md');
    if (notes === null) await rm(notesPath);
    else await writeFile(notesPath, notes);
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', `${_case} target notes`);
    const paths = [
      'package.json',
      'package-lock.json',
      'docs/release-records.json',
      'test/version-pin.test.ts',
    ];
    const before = await Promise.all(paths.map((path) => readFile(join(fixture.root, path), 'utf8')));

    await expect(prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities)).rejects.toThrow(message);
    await expect(Promise.all(paths.map((path) => readFile(join(fixture.root, path), 'utf8'))))
      .resolves.toEqual(before);
  });

  it('verifies release identity facts and nonblank candidate notes after additional reviewed changes', async () => {
    const fixture = await createFixture();
    const base = git(fixture.root, 'rev-parse', 'HEAD');
    await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);
    await writeFile(join(fixture.root, 'README.md'), 'reviewed release correction\n');
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', 'prepare 1.2.0');
    const candidate = git(fixture.root, 'rev-parse', 'HEAD');

    expect(verifyReleaseIdentity(fixture.root, base, candidate, fixture.authorities))
      .toMatchObject({
        base,
        candidate,
        oldVersion: '1.1.0',
        newVersion: '1.2.0',
        paths: expect.arrayContaining(['docs/releases/1.2.0.md']),
      });
  });

  it.each([
    ['missing', null, /Release notes are missing/],
    ['blank', '   \n', /Release notes are blank/],
  ])('rejects a candidate with %s release notes', async (_case, notes, message) => {
    const fixture = await createFixture();
    const base = git(fixture.root, 'rev-parse', 'HEAD');
    await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);
    const notesPath = join(fixture.root, 'docs/releases/1.2.0.md');
    if (notes === null) await rm(notesPath);
    else await writeFile(notesPath, notes);
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', `prepare release with ${_case} notes`);

    expect(() => verifyReleaseIdentity(
      fixture.root,
      base,
      git(fixture.root, 'rev-parse', 'HEAD'),
      fixture.authorities,
    )).toThrow(message);
  });

  it('rejects a stale version pin', async () => {
    const fixture = await createFixture();
    const base = git(fixture.root, 'rev-parse', 'HEAD');
    await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);
    await writeFile(join(fixture.root, 'test/version-pin.test.ts'), "expect('tampered').toBe('tampered');\n");
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', 'tamper with release identity');
    const candidate = git(fixture.root, 'rev-parse', 'HEAD');

    expect(() => verifyReleaseIdentity(fixture.root, base, candidate, fixture.authorities))
      .toThrow(/Version-pin assertion is stale/);
  });

  it.each([
    ['prerelease', '1.2.0-rc.1', /stable x\.y\.z/],
    ['lower', '1.0.1', /must be newer than 1\.1\.0/],
  ])('rejects a %s candidate version', async (_case, version, message) => {
    const fixture = await createFixture();
    const base = git(fixture.root, 'rev-parse', 'HEAD');
    await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);
    for (const path of ['package.json', 'package-lock.json', 'test/version-pin.test.ts']) {
      const file = join(fixture.root, path);
      await writeFile(file, (await readFile(file, 'utf8')).replaceAll('1.2.0', version));
    }
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', `prepare ${version}`);

    expect(() => verifyReleaseIdentity(
      fixture.root, base, git(fixture.root, 'rev-parse', 'HEAD'), fixture.authorities,
    )).toThrow(message);
  });

  it('accepts only a final reconstructed true marker', async () => {
    const fixture = await createFixture();
    const record: ReleaseRecord = {
      outcome: 'published',
      version: '1.0.0',
      tag: 'v1.0.0',
      tag_object: git(fixture.root, 'rev-parse', 'v1.0.0^{tag}'),
      commit: git(fixture.root, 'rev-parse', 'v1.0.0^{commit}'),
      tree: git(fixture.root, 'rev-parse', 'v1.0.0^{commit}^{tree}'),
      workflow_run_id: 100,
      workflow_run_attempt: 1,
      workflow_conclusion: 'success',
      verify_job_id: null,
      publish_job_id: null,
      artifact_integrity: `sha512-${'A'.repeat(86)}==`,
      reconstructed: true,
    };

    expect(verifyReleaseProvenance(fixture.root, record, fixture.authorities))
      .toMatchObject({ version: '1.0.0', reconstructed: true });
    expect(() => verifyReleaseProvenance(fixture.root, {
      ...record,
      reconstructed: false,
    } as unknown as ReleaseRecord, fixture.authorities)).toThrow(/invalid or non-canonical shape/);
    const { reconstructed, ...fields } = record;
    expect(() => verifyReleaseProvenance(fixture.root, {
      reconstructed,
      ...fields,
    } as ReleaseRecord, fixture.authorities)).toThrow(/invalid or non-canonical shape/);
  });

  it('rejects preparation when the immediately previous published version is unrecorded', async () => {
    const fixture = await createFixture();
    const skippedAuthorities = {
      ...fixture.authorities,
      publishedVersions: () => ['1.0.0', '1.0.1'],
    };

    await expect(prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, skippedAuthorities)).rejects.toThrow(
      'Immediately previous published version is missing from release records: 1.0.1',
    );

    await prepareRelease(fixture.root, '1.2.0', {
      workflowRunId: 200,
      workflowRunAttempt: 1,
      workflowConclusion: 'failure',
    }, fixture.authorities);
    git(fixture.root, 'add', '.');
    git(fixture.root, 'commit', '-m', 'prepare release with skipped predecessor');
    const candidate = git(fixture.root, 'rev-parse', 'HEAD');
    expect(() => verifyReleaseIdentity(
      fixture.root,
      git(fixture.root, 'rev-parse', 'HEAD^'),
      candidate,
      skippedAuthorities,
    )).toThrow('Immediately previous published version is missing from release records: 1.0.1');
  });
});

async function createFixture(): Promise<{
  root: string;
  authorities: ReleaseAuthorities;
}> {
  const root = await mkdtemp(join(tmpdir(), 'borgmcp-shared-release-identity-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'test'), { recursive: true });
  await mkdir(join(root, 'docs/releases'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'borgmcp-shared', version: '1.1.0' }, null, 2) + '\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({
    name: 'borgmcp-shared', version: '1.1.0', lockfileVersion: 3, packages: { '': { name: 'borgmcp-shared', version: '1.1.0' } },
  }, null, 2) + '\n');
  await writeFile(join(root, 'scripts/release-identity-allowlist.json'), JSON.stringify({ versionPins: ['test/version-pin.test.ts'] }, null, 2) + '\n');
  await writeFile(join(root, 'test/version-pin.test.ts'), "expect('1.1.0').toBe('1.1.0');\n");
  await writeFile(join(root, 'docs/releases/1.2.0.md'), 'Release notes for 1.2.0.\n');
  await writeFile(join(root, 'docs/release-records.json'), JSON.stringify([{
    outcome: 'published', version: '1.0.0', tag: 'v1.0.0', tag_object: '', commit: '', tree: '',
    workflow_run_id: 100, workflow_run_attempt: 1, workflow_conclusion: 'success',
    verify_job_id: null, publish_job_id: null,
    artifact_integrity: `sha512-${'A'.repeat(86)}==`,
  }], null, 2) + '\n');
  git(root, 'init', '--initial-branch=main');
  git(root, 'config', 'user.name', 'Release Test');
  git(root, 'config', 'user.email', 'release-test@example.invalid');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  git(root, 'tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
  const anchorCommit = git(root, 'rev-parse', 'HEAD');
  const anchorTag = git(root, 'rev-parse', 'v1.0.0^{tag}');
  const anchorTree = git(root, 'rev-parse', 'v1.0.0^{commit}^{tree}');
  const records = JSON.parse(await readFile(join(root, 'docs/release-records.json'), 'utf8'));
  records[0].tag_object = anchorTag;
  records[0].commit = anchorCommit;
  records[0].tree = anchorTree;
  await writeFile(join(root, 'docs/release-records.json'), JSON.stringify(records, null, 2) + '\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'borgmcp-shared', version: '1.1.0' }, null, 2) + '\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({
    name: 'borgmcp-shared', version: '1.1.0', lockfileVersion: 3, packages: { '': { name: 'borgmcp-shared', version: '1.1.0' } },
  }, null, 2) + '\n');
  await writeFile(join(root, 'test/version-pin.test.ts'), "expect('1.1.0').toBe('1.1.0');\n");
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'failed release base');
  git(root, 'tag', '-a', 'v1.1.0', '-m', 'v1.1.0');
  const failedCommit = git(root, 'rev-parse', 'HEAD');
  const authorities: ReleaseAuthorities = {
    githubRun: (_root, runId) => runId === 100
      ? { id: 100, run_attempt: 1, head_sha: anchorCommit, head_branch: 'v1.0.0', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml' }
      : { id: 200, run_attempt: 1, head_sha: failedCommit, head_branch: 'v1.1.0', event: 'push', status: 'completed', conclusion: 'failure', path: '.github/workflows/publish.yml' },
    artifactIntegrity: () => `sha512-${'A'.repeat(86)}==`,
    publishedVersions: () => ['1.0.0'],
  };
  return { root, authorities };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
