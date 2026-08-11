import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

function assertHistoricalReleaseRecord(releases: string): void {
  expect(releases).not.toMatch(
    /(?:\b(?:current|currently|now)\b(?:(?!\n\s*\n)[\s\S])*?\b(?:(?:un)?publish(?:ed|ing)?|install(?:ed|ing)?)\b|\b(?:(?:un)?publish(?:ed|ing)?|install(?:ed|ing)?)\b(?:(?!\n\s*\n)[\s\S])*?\b(?:current|currently|now)\b)/i,
  );
}

describe('npm publish workflow', () => {
  it('classifies release identity PRs with the trusted base verifier', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');

    expect(workflow.match(/^  release-identity:$/gm)).toHaveLength(1);
    expect(workflow).toContain("if: github.event_name == 'pull_request'");
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('CANDIDATE_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toContain('if test "${base_version}" = "${candidate_version}"; then');
    expect(workflow).toContain('git show "${BASE_SHA}:scripts/release-identity.mjs" > "${trusted_verifier}"');
    expect(workflow).toContain('node "${trusted_verifier}" verify "${BASE_SHA}" "${CANDIDATE_SHA}"');
    expect(workflow.match(/node "\$\{trusted_verifier\}" verify/g)).toHaveLength(1);
  });

  it('skips the release identity verifier when the package version is unchanged', async () => {
    const fixture = await createClassifierFixture('1.0.0', '1.0.0');
    try {
      const output = runClassifier(fixture, await readFile('.github/workflows/ci.yml', 'utf8'));

      expect(output).toContain('Package version unchanged');
      await expect(readFile(fixture.marker, 'utf8')).rejects.toThrow();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('runs the trusted base verifier and propagates its failure when the version changes', async () => {
    const fixture = await createClassifierFixture('1.0.0', '1.0.1', 'process.exit(0);\n');
    try {
      const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
      expect(() => runClassifier(fixture, workflow)).toThrow();
      expect(await readFile(fixture.marker, 'utf8')).toBe('base verifier ran\n');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('passes a changed version when the trusted base verifier succeeds', async () => {
    const fixture = await createClassifierFixture(
      '1.0.0',
      '1.0.1',
      'process.exit(23);\n',
      [
        "import { appendFileSync } from 'node:fs';",
        "appendFileSync(process.env.VERIFIER_MARKER, 'base verifier ran\\n');",
        '',
      ].join('\n'),
    );
    try {
      const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
      expect(runClassifier(fixture, workflow)).toBe('');
      expect(await readFile(fixture.marker, 'utf8')).toBe('base verifier ran\n');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('uses one protected build, package, and publish authority', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const compatibility = await readFile('docs/compatibility.md', 'utf8');
    const configurationGuard = await readFile('scripts/verify-release-configuration.mjs', 'utf8');

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow.match(/^  publish:$/gm)).toHaveLength(1);
    expect(workflow).toContain('environment:\n      name: npm-publish');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('test "${GITHUB_RUN_ATTEMPT}" = "1"');

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
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(publish);
    expect(workflow).toContain('NPM_EXPECTED_OWNER: ${{ vars.NPM_EXPECTED_OWNER }}');
    expect(workflow).toContain('npm publish "./release/${{ steps.pack.outputs.tarball }}" --ignore-scripts --access public --provenance --registry=https://registry.npmjs.org');
    expect(workflow).not.toContain('verify-registry-release.mjs postpublish');
    expect(workflow).not.toContain('registry-verification');
    expect(workflow).not.toContain('npm audit signatures');

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
    expect(runbook).toContain('no post-publication registry readback');
    expect(runbook).toContain('Coupled Publication Window');
    expect(runbook).toContain('matching coupled');
    expect(compatibility).toMatch(/publication window is a release\s+property/i);
    expect(compatibility).toContain('matching coupled shared, server, and client versions');
    expect(compatibility).not.toContain('There is no mixed-version window');
    expect(runbook).not.toContain('ARTIFACT_SR_');
    expect(runbook).not.toContain('Security must download and audit that exact workflow artifact');
    expect(configurationGuard).not.toContain('ALLOW_UNCLAIMED_FIRST_PUBLISH');
  });

  it('builds generated output before every dist-importing validation lane', async () => {
    const ci = await readFile('.github/workflows/ci.yml', 'utf8');
    const publish = await readFile('.github/workflows/publish.yml', 'utf8');
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: { prepack: string };
    };
    const packageJobStart = ci.indexOf('  package:\n');
    const nextJobStart = ci.indexOf('\n  release-identity:', packageJobStart);
    const packageJob = ci.slice(packageJobStart, nextJobStart);

    expect(packageJobStart).toBeGreaterThan(-1);
    expect(nextJobStart).toBeGreaterThan(packageJobStart);
    for (const lane of [packageJob, publish, packageJson.scripts.prepack]) {
      const build = lane.indexOf('npm run build');
      expect(build).toBeGreaterThan(-1);
      expect(lane.indexOf('npm run check')).toBeGreaterThan(build);
      expect(lane.indexOf('npm test')).toBeGreaterThan(build);
    }
  });

  it('keeps internal release state out of the README and release history', async () => {
    // SR f0969024: a version bump must retire the pre-bump framing. A stale claim
    // that the source "never claims to be <version>" or defers the bump to a
    // future sprint-close step contradicts an exact head that already carries it.
    const distribution = await readFile('README.md', 'utf8');
    const releases = await readFile('RELEASES.md', 'utf8');
    const enrollment = await readFile('docs/enrollment.md', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');

    for (const doc of [distribution, enrollment, runbook]) {
      expect(doc).not.toMatch(/never claims to be/i);
      expect(doc).not.toMatch(/sprint-close (publish )?step/i);
    }
    expect(distribution).not.toMatch(
      /\b(?:release candidate|registry token|npm publish|publishing uses|provenance verification|release approval)\b/i,
    );
    assertHistoricalReleaseRecord(releases);
    for (const presentStateClaim of [
      'This source now identifies the unpublished `0.8.1` release candidate.',
      'This source now identifies the\nunpublished `0.8.1` release candidate.',
      'This package is currently\npublished.',
      'Install the\ncurrent package.',
    ]) {
      expect(() => assertHistoricalReleaseRecord(
        `${releases}\n\n${presentStateClaim}\n`,
      )).toThrow();
    }

    const immutableEvidence = `${releases}\n${enrollment}\n${runbook}`;
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
  }, 10_000);
});

interface ClassifierFixture {
  root: string;
  base: string;
  candidate: string;
  marker: string;
}

async function createClassifierFixture(
  baseVersion: string,
  candidateVersion: string,
  candidateVerifier?: string,
  baseVerifier = [
    "import { appendFileSync } from 'node:fs';",
    "appendFileSync(process.env.VERIFIER_MARKER, 'base verifier ran\\n');",
    'process.exit(23);',
    '',
  ].join('\n'),
): Promise<ClassifierFixture> {
  const root = await mkdtemp(join(tmpdir(), 'borgmcp-shared-release-classifier-'));
  const marker = join(root, 'verifier-marker');
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: baseVersion }) + '\n');
  await writeFile(join(root, 'scripts/release-identity.mjs'), baseVerifier);
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Release Classifier Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'release-classifier@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'base'], { cwd: root, stdio: 'ignore' });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  await writeFile(join(root, 'package.json'), JSON.stringify({ version: candidateVersion }) + '\n');
  await writeFile(join(root, 'candidate-change'), 'candidate\n');
  if (candidateVerifier !== undefined) {
    await writeFile(join(root, 'scripts/release-identity.mjs'), candidateVerifier);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'candidate'], { cwd: root, stdio: 'ignore' });
  const candidate = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return { root, base, candidate, marker };
}

function runClassifier(fixture: ClassifierFixture, workflow: string): string {
  const runBlock = workflow.match(/      - name: Classify release identity[\s\S]*?        run: \|\n((?: {10}.*\n?)*)$/);
  if (runBlock?.[1] === undefined) throw new Error('release identity classifier run block not found');
  const script = runBlock[1].replace(/^ {10}/gm, '');
  return execFileSync('bash', ['-c', script], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_SHA: fixture.base,
      CANDIDATE_SHA: fixture.candidate,
      RUNNER_TEMP: fixture.root,
      VERIFIER_MARKER: fixture.marker,
    },
  });
}
