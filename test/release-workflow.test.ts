import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('npm publish workflow', () => {
  it('is tag-only, protected, pinned, and publishes the verified tarball', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const parts = workflow.split('\n  validate:\n');
    const verificationJob = parts[0]!;
    const rest = parts[1]!;
    const publishParts = rest.split('\n  publish:\n');
    const validateJob = publishParts[0]!;
    const publishJob = publishParts[1]!;

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('description: Release tag to publish (must already be verified by the tag-push run)');
    expect(workflow).toContain('required: true');

    for (const job of [verificationJob, publishJob]) {
      const guard = job.indexOf('- name: Reject untrusted release inputs before npm bootstrap');
      const bootstrap = job.indexOf('- name: Set up exact npm');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(bootstrap);
      expect(job.slice(guard, bootstrap)).toContain('test "${GITHUB_RUN_ATTEMPT}" = "1"');
      expect(job.slice(guard, bootstrap)).toContain('test ! -e .npmrc');
    }

    expect(workflow.match(/npm_userconfig="\$\{RUNNER_TEMP\}\/npm-bootstrap-user\.npmrc"/g)).toHaveLength(2);
    expect(workflow.match(/npm_cache="\$\{RUNNER_TEMP\}\/npm-bootstrap-cache"/g)).toHaveLength(2);
    expect(workflow.match(/--registry=https:\/\/registry\.npmjs\.org install --prefix/g)).toHaveLength(2);
    expect(workflow.match(/config get registry\)" = "https:\/\/registry\.npmjs\.org\/"/g)).toHaveLength(2);
    expect(workflow).toContain('contents: read');

    expect(verificationJob).not.toContain('id-token: write');
    expect(verificationJob).not.toContain('environment:');
    expect(verificationJob).not.toContain('NODE_AUTH_TOKEN');
    expect(verificationJob).toContain('npm publish "./release/${{ steps.pack.outputs.tarball }}" --dry-run --ignore-scripts --access public --registry=https://registry.npmjs.org');
    expect(verificationJob).toContain('Upload tarball for security audit');
    expect(verificationJob).toContain('release/RUN_EVIDENCE');
    expect(verificationJob).toContain('npm sbom --sbom-format cyclonedx');
    expect(verificationJob).toContain('node scripts/normalize-release-sbom.mjs "${raw_sbom}" "${sbom}"');
    expect(verificationJob).toContain('rm "${raw_sbom}"');
    expect(verificationJob).toContain('npm run verify:sbom -- "${sbom}" > release/sbom-report.json');
    expect(verificationJob).toContain('release/borgmcp-shared-${{ steps.release.outputs.version }}.cdx.json');
    expect(verificationJob).toContain('release/sbom-report.json');
    expect(verificationJob).toContain('"borgmcp-shared-${{ steps.release.outputs.version }}.cdx.json" sbom-report.json > SHA512SUMS');
    expect(verificationJob).toContain('Exercise exact tarball in a clean consumer');
    expect(verificationJob).toContain('"dependencies":{"borgmcp-shared":"%s"}');
    expect(verificationJob).toContain('npm install --prefix "${consumer}" --ignore-scripts --no-save "./release/${TARBALL}"');
    expect(verificationJob).toContain('npm ls --prefix "${consumer}" --omit=dev --all');
    for (const specifier of [
      'borgmcp-shared',
      'borgmcp-shared/templates',
      'borgmcp-shared/role-section',
      'borgmcp-shared/log-stream-hwm',
      'borgmcp-shared/drone-address',
      'borgmcp-shared/protocol',
      'borgmcp-shared/domain',
      'borgmcp-shared/conformance',
      'borgmcp-shared/package.json',
    ]) expect(verificationJob).toContain(specifier);

    expect(validateJob).toContain('if: github.event_name == \'workflow_dispatch\'');
    expect(validateJob).toContain('actions: read');
    expect(validateJob).not.toContain('environment:');
    expect(validateJob).toContain('ARTIFACT_SR_SHA512');
    expect(validateJob).toContain('ARTIFACT_SR_RUN_ID');
    expect(validateJob).toContain('ARTIFACT_SR_RUN_ATTEMPT');
    expect(validateJob).toContain('Bind SR approval tuple and verify source run');
    expect(validateJob).toContain('getWorkflowRun');
    expect(validateJob).toContain('publish.yml');
    expect(validateJob).toContain('validate-sr-gate');

    expect(publishJob).toContain('needs: validate');
    expect(publishJob).toContain('run-id:');
    expect(publishJob).toContain('github-token: ${{ github.token }}');
    expect(publishJob).toContain('environment:\n      name: npm-publish');
    expect(publishJob).toContain('id-token: write');
    expect(publishJob).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(publishJob).toContain('Download artifact from SR-approved run');
    expect(publishJob).toContain('Re-bind SR approval tuple in publish context');
    expect(publishJob).toContain('ARTIFACT_SR_SHA512');
    expect(publishJob).toContain('ARTIFACT_SR_RUN_ID');
    expect(publishJob).toContain('ARTIFACT_SR_RUN_ATTEMPT');
    expect(publishJob).toContain('npm publish "./release/${{ needs.validate.outputs.tarball }}" --ignore-scripts --access public --provenance --registry=https://registry.npmjs.org');
    expect(workflow.match(/npm publish "\.\/release\//g)).toHaveLength(2);
    expect(workflow).not.toMatch(/npm publish "release\//);

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
    expect(runbook).toContain('Run `29360398007` published `borgmcp-shared@0.2.2`');
    expect(runbook).toContain('MUST NOT be rerun, moved, or reused. Consumer\nmigration was blocked');
    expect(runbook).toContain('Security approved the recovery\nevidence.');
    expect(runbook).toContain('`borgmcp-shared-enrollment-version` decision defined this breaking');
    expect(runbook).toContain('does not authorize creating `v0.4.0`');
    expect(runbook).toContain('reviewed registry range `^0.4.0`');
    expect(runbook).toContain('rejects any attempt other than `1`\nbefore dependency installation');
    expect(runbook).toContain('All three jobs reject a repository-root `.npmrc` before their first npm command.');
    expect(runbook).toContain('validate` job runs first (outside');
    expect(runbook).toContain('queries the source\nrun\'s workflow path, tag, conclusion, and attempt');
  });

  it('release-source docs affirm the current package version, not a pre-bump future claim', async () => {
    // SR f0969024: a version bump must retire the pre-bump framing. A stale claim
    // that the source "never claims to be <version>" or defers the bump to a
    // future sprint-close step contradicts an exact head that already carries it.
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
    const distribution = await readFile('README.md', 'utf8');
    const enrollment = await readFile('docs/enrollment.md', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');

    for (const doc of [distribution, enrollment, runbook]) {
      expect(doc).not.toMatch(/never claims to be/i);
      expect(doc).not.toMatch(/sprint-close (publish )?step/i);
    }
    // README + enrollment positively state the source now carries the version...
    expect(distribution).toMatch(/this source now identifies/i);
    expect(enrollment).toMatch(/this source now identifies/i);
    // ...and the Distribution guidance names the current package version.
    expect(distribution).toContain(`\`${pkg.version}\``);
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

  it.each(['2', '3'])('rejects workflow rerun attempt %s', (attempt) => {
    expect(() => execFileSync('bash', ['-eu', '-c', 'test "${GITHUB_RUN_ATTEMPT}" = "1"'], {
      env: { ...process.env, GITHUB_RUN_ATTEMPT: attempt },
      stdio: 'ignore',
    })).toThrow();
  });

  it('rejects a hostile repository npm config before npm bootstrap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'borgmcp-hostile-npmrc-'));
    const fakeBin = join(root, 'bin');
    const marker = join(root, 'npm-ran');
    try {
      await mkdir(fakeBin);
      await writeFile(join(root, '.npmrc'), 'registry=https://registry.invalid/\n');
      await writeFile(join(fakeBin, 'npm'), '#!/bin/sh\ntouch "${MARKER}"\n');
      await chmod(join(fakeBin, 'npm'), 0o755);
      expect(() => execFileSync('bash', ['-eu', '-c', 'test ! -e .npmrc; npm --version'], {
        cwd: root,
        env: { ...process.env, MARKER: marker, PATH: `${fakeBin}:${process.env.PATH}` },
        stdio: 'ignore',
      })).toThrow();
      await expect(access(marker)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
