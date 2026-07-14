import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('npm publish workflow', () => {
  it('is tag-only, protected, pinned, and publishes the verified tarball', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const [verificationJob, publishJob] = workflow.split('\n  publish:\n');
    const releaseStep = verificationJob.slice(
      verificationJob.indexOf('- name: Verify release source and tag'),
      verificationJob.indexOf('- name: Install locked dependencies without lifecycle scripts'),
    );

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('description: Existing immutable release tag to verify without publishing');
    expect(workflow).toContain('required: true');
    expect(releaseStep).toContain('DISPATCH_TAG: ${{ inputs.tag }}');
    expect(releaseStep.match(/\$\{\{ inputs\.tag \}\}/g)).toHaveLength(1);
    expect(releaseStep).toContain('release_tag="${DISPATCH_TAG}"');
    expect(releaseStep).not.toContain('release_tag="${{ inputs.tag }}"');
    expect(releaseStep).toContain('test "${GITHUB_REF_TYPE}" = "branch"');
    expect(releaseStep).toContain('test "${GITHUB_REF_NAME}" = "main"');
    expect(releaseStep).toContain('test "${GITHUB_REF}" = "refs/heads/main"');
    expect(releaseStep).toContain('git fetch --no-tags origin "refs/heads/main:${protected_main_ref}"');
    expect(releaseStep).toContain('git merge-base --is-ancestor "${GITHUB_SHA}" "${protected_main_ref}"');
    expect(workflow).toContain('contents: read');
    expect(verificationJob).not.toContain('id-token: write');
    expect(verificationJob).not.toContain('environment:');
    expect(verificationJob).not.toContain('NODE_AUTH_TOKEN');
    expect(publishJob).toContain('id-token: write');
    expect(publishJob).toContain("if: github.event_name == 'push'");
    expect(publishJob).toContain('needs: verify');
    expect(workflow).toContain('environment:\n      name: npm-publish');
    expect(workflow).toContain('node-version: 22.22.2');
    expect(workflow).toContain('npm@11.18.0');
    expect(verificationJob).toContain('git fetch --no-tags origin "refs/tags/${release_tag}:${verification_ref}"');
    expect(verificationJob).toContain('test "$(git cat-file -t "${verification_ref}")" = "tag"');
    expect(verificationJob).toContain('test "$(git rev-parse HEAD)" = "${release_commit}"');
    expect(workflow.match(/npm_prefix="\$\{RUNNER_TEMP\}\/npm-11\.18\.0"/g)).toHaveLength(2);
    expect(workflow.match(/>> "\$\{GITHUB_PATH\}"/g)).toHaveLength(2);
    expect(workflow).not.toMatch(/npm install[^\n]*--global/);
    expect(workflow).not.toContain('npm install --global');
    expect(verificationJob).toContain('npm publish "./release/${{ steps.pack.outputs.tarball }}" --dry-run --ignore-scripts --access public --registry=https://registry.npmjs.org');
    expect(publishJob).toContain('npm publish "./release/${{ needs.verify.outputs.tarball }}" --ignore-scripts --access public --provenance --registry=https://registry.npmjs.org');
    expect(workflow.match(/npm publish "\.\/release\//g)).toHaveLength(2);
    expect(workflow).not.toMatch(/npm publish "release\//);
    expect(verificationJob).toContain('Upload tarball for security audit');
    expect(publishJob).toContain('Download security-audited tarball');
    const prepublishStep = publishJob.slice(
      publishJob.indexOf('- name: Verify version availability and ownership'),
      publishJob.indexOf('- name: Publish exact audited tarball with provenance'),
    );
    expect(prepublishStep).toContain('NPM_TOKEN_PRESENT');
    expect(prepublishStep).not.toContain('NODE_AUTH_TOKEN');
    expect(workflow.match(/NODE_AUTH_TOKEN/g)).toHaveLength(1);
    expect(workflow).not.toContain('publishConfig.registry');
    expect(workflow).not.toMatch(/uses: [^\n]+@(v|main|master)\b/);
    expect(runbook).toContain('The failed `v0.2.0` tag is\nimmutable and MUST NOT be moved, reused, or rerun.');
    expect(runbook).toContain('The remote `v0.2.1` tag remains valid\nand immutable and MUST NOT be moved, reused, or rerun.');
    expect(runbook).toContain('`v0.2.0` bootstrap run, `29353763609`');
    expect(runbook).toContain('`v0.2.1` tag run, `29355823822`');
    expect(runbook).toContain('verification-only proof run, `29356980492`, confirmed\nthe repaired tag/source trust checks');
    expect(runbook).toContain('explicit `./release/<tarball>` filesystem paths.');
    expect(runbook).toContain('proof run, `29357632667`, passed every verification gate');
    expect(runbook).toContain('`borgmcp-shared-recovery-version` decision, `0.2.2` is the\nselected recovery version.');
  });

  it.each([
    ['tag', 'v0.2.1'],
    ['branch', 'release-candidate'],
  ])('rejects a %s dispatch from %s instead of protected main', (refType, refName) => {
    expect(() => execFileSync('bash', ['-eu', '-c',
      'test "${GITHUB_REF_TYPE}" = branch && test "${GITHUB_REF_NAME}" = main && test "${GITHUB_REF}" = refs/heads/main',
    ], {
      env: {
        ...process.env,
        GITHUB_REF_TYPE: refType,
        GITHUB_REF_NAME: refName,
        GITHUB_REF: refType === 'tag' ? `refs/tags/${refName}` : `refs/heads/${refName}`,
      },
      stdio: 'ignore',
    })).toThrow();
  });

  it('treats a hostile dispatch tag as environment data, not shell source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'borgmcp-dispatch-input-'));
    const marker = join(root, 'injected');
    try {
      execFileSync('bash', ['-eu', '-c', 'release_tag="${DISPATCH_TAG}"; test "${release_tag}" = "${DISPATCH_TAG}"'], {
        env: { ...process.env, DISPATCH_TAG: `$(touch "${marker}")` },
      });
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('passes a generated tarball to npm as an explicit local file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'borgmcp-local-tarball-'));
    const packageDir = join(root, 'package');
    const releaseDir = join(root, 'release');
    const tarball = join(releaseDir, 'local-file-spec-1.0.0.tgz');
    try {
      await mkdir(packageDir);
      await mkdir(releaseDir);
      await writeFile(join(packageDir, 'package.json'), JSON.stringify({
        name: 'borgmcp-local-file-spec-regression',
        version: '1.0.0',
      }));
      execFileSync('tar', ['-czf', tarball, '-C', root, 'package']);
      execFileSync('npm', [
        'publish',
        './release/local-file-spec-1.0.0.tgz',
        '--dry-run',
        '--ignore-scripts',
        '--access',
        'public',
        '--registry=https://registry.npmjs.org',
      ], { cwd: root, stdio: 'pipe' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers the annotated tag object after checkout flattens the local tag ref', async () => {
    const root = await mkdtemp(join(tmpdir(), 'borgmcp-release-tag-'));
    const remote = join(root, 'remote.git');
    const source = join(root, 'source');
    const checkout = join(root, 'checkout');
    const git = (cwd: string, ...args: string[]) => execFileSync(
      'git',
      args,
      { cwd, encoding: 'utf8' },
    ).trim();

    try {
      git(root, 'init', '--bare', remote);
      git(root, 'init', '--initial-branch=main', source);
      git(source, 'config', 'user.name', 'Release Test');
      git(source, 'config', 'user.email', 'release-test@example.invalid');
      git(source, 'commit', '--allow-empty', '-m', 'release source');
      git(source, 'tag', '--annotate', 'v0.2.1', '--message', 'v0.2.1');
      git(source, 'remote', 'add', 'origin', remote);
      git(source, 'push', 'origin', 'main', 'refs/tags/v0.2.1');
      const commit = git(source, 'rev-parse', 'HEAD');

      git(root, 'init', checkout);
      git(checkout, 'remote', 'add', 'origin', remote);
      git(checkout, 'fetch', '--no-tags', 'origin', `+${commit}:refs/tags/v0.2.1`);
      expect(git(checkout, 'cat-file', '-t', 'refs/tags/v0.2.1')).toBe('commit');

      git(checkout, 'fetch', '--no-tags', 'origin', 'refs/tags/v0.2.1:refs/release-verification/v0.2.1');
      expect(git(checkout, 'cat-file', '-t', 'refs/release-verification/v0.2.1')).toBe('tag');
      expect(git(checkout, 'rev-parse', 'refs/release-verification/v0.2.1^{commit}')).toBe(commit);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
