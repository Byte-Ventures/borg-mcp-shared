import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createReleaseRecord,
  prepareRelease,
  type ReleaseAuthorities,
} from '../scripts/release-identity.mjs';

const directories: string[] = [];
const skippedSteps = [
  'Build exact release tarball',
  'Reject existing version and wrong owner',
  'Exercise exact tarball in a clean consumer',
  'Publish exact verified tarball with provenance',
];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('release identity recovery', () => {
  it('records only an attempt-1 pre-publication failure', async () => {
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
      verify_job_id: 22,
      publish_job_id: 22,
      artifact_integrity: null,
    });

    await expect(Promise.resolve().then(() => createReleaseRecord(fixture.root, {
      version: '1.1.0',
      workflowRunId: 200,
      workflowRunAttempt: 2,
      workflowConclusion: 'failure',
    }, fixture.authorities))).rejects.toThrow(/exactly workflow attempt 1/);
  });

  it('rejects a failure after packaging or when npm contains the version', async () => {
    const fixture = await createFixture();
    const reachedPackaging = fixture.jobs.jobs[0].steps[0];
    reachedPackaging.status = 'completed';
    reachedPackaging.conclusion = 'success';
    expect(() => createReleaseRecord(fixture.root, {
      version: '1.1.0', workflowRunId: 200, workflowRunAttempt: 1, workflowConclusion: 'failure',
    }, fixture.authorities)).toThrow(/step was not skipped/);

    reachedPackaging.status = 'completed';
    reachedPackaging.conclusion = 'skipped';
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
});

async function createFixture(): Promise<{
  root: string;
  authorities: ReleaseAuthorities;
  jobs: { jobs: Array<{ steps: Array<{ name: string; status: string; conclusion: string }> }> };
}> {
  const root = await mkdtemp(join(tmpdir(), 'borgmcp-shared-release-identity-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'test'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'borgmcp-shared', version: '1.1.0' }, null, 2) + '\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({
    name: 'borgmcp-shared', version: '1.1.0', lockfileVersion: 3, packages: { '': { name: 'borgmcp-shared', version: '1.1.0' } },
  }, null, 2) + '\n');
  await writeFile(join(root, 'scripts/release-identity-allowlist.json'), JSON.stringify({ versionPins: ['test/version-pin.test.ts'] }, null, 2) + '\n');
  await writeFile(join(root, 'test/version-pin.test.ts'), "expect('1.1.0').toBe('1.1.0');\n");
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
  const jobs = { jobs: [{ id: 22, run_id: 200, run_attempt: 1, head_sha: failedCommit, name: 'publish', status: 'completed', conclusion: 'failure', steps: skippedSteps.map((name) => ({ name, status: 'completed', conclusion: 'skipped' })) }] };
  const authorities: ReleaseAuthorities = {
    githubRun: (_root, runId) => runId === 100
      ? { id: 100, run_attempt: 1, head_sha: anchorCommit, head_branch: 'v1.0.0', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml' }
      : { id: 200, run_attempt: 1, head_sha: failedCommit, head_branch: 'v1.1.0', event: 'push', status: 'completed', conclusion: 'failure', path: '.github/workflows/publish.yml' },
    githubRunJobs: () => jobs,
    artifactIntegrity: () => `sha512-${'A'.repeat(86)}==`,
    publishedVersions: () => ['1.0.0'],
  };
  return { root, authorities, jobs };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}
