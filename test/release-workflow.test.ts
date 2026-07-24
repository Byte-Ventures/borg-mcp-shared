import { execFileSync } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('npm publish workflow', () => {
  it('uses one protected build, package, and publish authority', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const configurationGuard = await readFile('scripts/verify-release-configuration.mjs', 'utf8');

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow.match(/^  publish:$/gm)).toHaveLength(1);
    expect(workflow).toContain('environment:\n      name: npm-publish');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('test "${GITHUB_RUN_ATTEMPT}" = "1"');
    expect(workflow).toContain('test ! -e .npmrc');

    for (const command of [
      'npm ci --ignore-scripts',
      'npm audit --audit-level=high',
      'npm run check',
      'npm test',
      'npm run build',
      'npm pack --ignore-scripts',
    ]) {
      expect(workflow.split(command)).toHaveLength(2);
    }

    expect(workflow).toContain('node scripts/verify-registry-release.mjs prepublish "release/${{ steps.pack.outputs.tarball }}"');
    expect(workflow).toContain('Exercise exact tarball in a clean consumer');
    for (const specifier of [
      'borgmcp-shared',
      'borgmcp-shared/templates',
      'borgmcp-shared/role-section',
      'borgmcp-shared/log-stream-hwm',
      'borgmcp-shared/drone-address',
      'borgmcp-shared/runtime-metadata',
      'borgmcp-shared/protocol',
      'borgmcp-shared/domain',
      'borgmcp-shared/conformance',
      'borgmcp-shared/package.json',
    ]) expect(workflow).toContain(specifier);

    const preflight = workflow.indexOf('- name: Reject existing version and wrong owner');
    const publish = workflow.indexOf('- name: Publish exact verified tarball with provenance');
    const integrity = workflow.indexOf('- name: Verify exact registry integrity');
    const signatures = workflow.indexOf('- name: Verify registry signatures and attestations');
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(publish);
    expect(publish).toBeLessThan(integrity);
    expect(integrity).toBeLessThan(signatures);
    expect(workflow).toContain('NPM_EXPECTED_OWNER: ${{ vars.NPM_EXPECTED_OWNER }}');
    expect(workflow).toContain('npm publish "./release/${{ steps.pack.outputs.tarball }}" --ignore-scripts --access public --provenance --registry=https://registry.npmjs.org');
    expect(workflow).toContain('node scripts/verify-registry-release.mjs postpublish "${{ steps.preflight.outputs.name }}" "${{ steps.preflight.outputs.version }}" "${{ steps.preflight.outputs.integrity }}"');
    expect(workflow).toContain('npm audit signatures --prefix registry-verification');

    expect(workflow.match(/npm publish "\.\/release\//g)).toHaveLength(1);
    expect(workflow).not.toMatch(/npm publish "release\//);
    expect(workflow).not.toContain('NODE_AUTH_TOKEN');
    expect(workflow).not.toContain('publishConfig.registry');
    expect(workflow).not.toMatch(/uses: [^\n]+@(v|main|master)\b/);
    expect(workflow).not.toContain('origin/main');
    expect(workflow.match(/main_verification_ref="refs\/release-verification\/main"/g)).toHaveLength(1);
    expect(workflow.match(/git fetch --no-tags origin "\+refs\/heads\/main:\$\{main_verification_ref\}"/g)).toHaveLength(1);
    expect(workflow.match(/git merge-base --is-ancestor "\$\{release_commit\}" "\$\{main_verification_ref\}"/g)).toHaveLength(1);

    for (const retired of [
      'ARTIFACT_SR_',
      'validate-sr-gate',
      'RUN_EVIDENCE',
      'SHA512SUMS',
      'npm sbom',
      'upload-artifact',
      'download-artifact',
      'dsseEnvelope',
      'verifyProvenanceStatement',
    ]) expect(workflow).not.toContain(retired);

    expect(runbook).toContain('`minimal-package-release-assurance`');
    expect(runbook).toContain('one protected workflow job');
    expect(runbook).toContain('does not authorize a tag or publication');
    expect(runbook).not.toContain('ARTIFACT_SR_');
    expect(runbook).not.toContain('Security must download and audit that exact workflow artifact');
    expect(configurationGuard).not.toContain('ALLOW_UNCLAIMED_FIRST_PUBLISH');
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
    const immutableEvidence = `${distribution}\n${enrollment}\n${runbook}`;
    for (const evidence of [
      '045268aa8873da330819860012ecaddb4bc2883c',
      '1981d7373e77f6edb4567872c1544bdbe2b1ef20',
      '29984423571',
      'sha512-XUJq+FjY/cbarU9V1dIWnhNYcqyURTiGb6KyIzg99gy5hk/fEs5ee/8X/qvp7pw1Rshqt2J6I3TVbwJdlde2tA==',
    ]) expect(immutableEvidence).toContain(evidence);
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
  }, 120_000);

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

  it('verifies complete and shallow tag checkouts against an explicit full main ref', async () => {
    const root = await mkdtemp(join(tmpdir(), 'borgmcp-release-main-'));
    const remote = join(root, 'remote.git');
    const source = join(root, 'source');
    const completeCheckout = join(root, 'complete-checkout');
    const checkout = join(root, 'checkout');
    const git = (cwd: string, ...args: string[]) => execFileSync(
      'git',
      args,
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();

    try {
      git(root, 'init', '--bare', remote);
      git(root, 'init', '--initial-branch=main', source);
      git(source, 'config', 'user.name', 'Release Test');
      git(source, 'config', 'user.email', 'release-test@example.invalid');
      git(source, 'commit', '--allow-empty', '-m', 'release source');
      git(source, 'tag', '--annotate', 'v0.4.2', '--message', 'v0.4.2');
      const releaseCommit = git(source, 'rev-parse', 'HEAD');
      git(source, 'commit', '--allow-empty', '-m', 'post-release main');
      git(source, 'switch', '--orphan', 'unrelated');
      git(source, 'commit', '--allow-empty', '-m', 'unrelated source');
      git(source, 'switch', 'main');
      git(source, 'remote', 'add', 'origin', pathToFileURL(remote).href);
      git(source, 'push', 'origin', 'main', 'unrelated', 'refs/tags/v0.4.2');

      git(root, 'init', completeCheckout);
      git(completeCheckout, 'remote', 'add', 'origin', pathToFileURL(remote).href);
      git(
        completeCheckout,
        'fetch',
        '--no-tags',
        'origin',
        'refs/tags/v0.4.2:refs/release-verification/v0.4.2',
      );
      git(
        completeCheckout,
        'fetch',
        '--no-tags',
        'origin',
        '+refs/heads/main:refs/release-verification/main',
      );
      expect(git(completeCheckout, 'rev-parse', '--is-shallow-repository')).toBe('false');
      expect(() => git(
        completeCheckout,
        'merge-base',
        '--is-ancestor',
        releaseCommit,
        'refs/release-verification/main',
      )).not.toThrow();

      git(root, 'init', checkout);
      git(checkout, 'remote', 'add', 'origin', pathToFileURL(remote).href);
      git(checkout, 'fetch', '--depth=1', '--no-tags', 'origin', `+${releaseCommit}:refs/tags/v0.4.2`);
      git(checkout, 'switch', '--detach', 'refs/tags/v0.4.2');
      expect(git(checkout, 'rev-parse', '--is-shallow-repository')).toBe('true');
      expect(() => git(checkout, 'show-ref', '--verify', 'refs/remotes/origin/main')).toThrow();
      expect(() => git(
        checkout,
        'merge-base',
        '--is-ancestor',
        releaseCommit,
        'refs/release-verification/main',
      )).toThrow();

      git(checkout, 'fetch', '--no-tags', 'origin', 'refs/tags/v0.4.2:refs/release-verification/v0.4.2');
      git(
        checkout,
        'fetch',
        '--no-tags',
        '--unshallow',
        'origin',
        '+refs/heads/main:refs/release-verification/main',
      );
      expect(git(checkout, 'rev-parse', '--is-shallow-repository')).toBe('false');
      expect(git(checkout, 'rev-list', '--count', 'refs/release-verification/main')).toBe('2');
      expect(() => git(
        checkout,
        'merge-base',
        '--is-ancestor',
        releaseCommit,
        'refs/release-verification/main',
      )).not.toThrow();

      git(
        checkout,
        'fetch',
        '--no-tags',
        'origin',
        '+refs/heads/unrelated:refs/release-verification/unrelated',
      );
      expect(() => git(
        checkout,
        'merge-base',
        '--is-ancestor',
        releaseCommit,
        'refs/release-verification/unrelated',
      )).toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
