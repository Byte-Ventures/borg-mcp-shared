import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('npm publish workflow', () => {
  it('is tag-only, protected, pinned, and publishes the verified tarball', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const [verificationJob, publishJob] = workflow.split('\n  publish:\n');

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('description: Existing immutable release tag to verify without publishing');
    expect(workflow).toContain('required: true');
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
    expect(workflow).toContain('npm publish "release/${{ needs.verify.outputs.tarball }}" --ignore-scripts --access public --provenance --registry=https://registry.npmjs.org');
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
    expect(runbook).toContain('The failed `v0.2.0` tag is immutable and MUST\nNOT be moved, reused, or rerun.');
    expect(runbook).toContain('The remote `v0.2.1` tag remains valid and immutable and MUST NOT be moved, reused,\nor rerun.');
    expect(runbook).toContain('No recovery version is currently selected.');
    expect(runbook).toContain('A manual dispatch is verification-only: the publish job is restricted\nto tag-push events');
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
