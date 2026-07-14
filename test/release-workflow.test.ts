import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('npm publish workflow', () => {
  it('is tag-only, protected, pinned, and publishes the verified tarball', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    const runbook = await readFile('docs/releasing.md', 'utf8');
    const [verificationJob, publishJob] = workflow.split('\n  publish:\n');

    expect(workflow).toContain("tags: ['v*.*.*']");
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow).toContain('contents: read');
    expect(verificationJob).not.toContain('id-token: write');
    expect(publishJob).toContain('id-token: write');
    expect(publishJob).toContain('needs: verify');
    expect(workflow).toContain('environment:\n      name: npm-publish');
    expect(workflow).toContain('node-version: 22.22.2');
    expect(workflow).toContain('npm@11.18.0');
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
    expect(runbook).toContain('Recovery requires a separately Queen-authorized\nnew version and annotated tag.');
    expect(runbook).toContain('No recovery version is currently selected.');
  });
});
