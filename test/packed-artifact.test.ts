import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const materializeNpmEnv = { ...process.env, npm_config_dry_run: 'false' };

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('packed artifact', () => {
  async function pack(): Promise<{ destination: string; tarball: string }> {
    const destination = await mkdtemp(join(tmpdir(), 'borgmcp-shared-test-pack-'));
    temporaryDirectories.push(destination);
    const result = JSON.parse(execFileSync(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
      {
        encoding: 'utf8',
        env: materializeNpmEnv,
      },
    )) as Array<{ filename: string }>;
    return { destination, tarball: join(destination, result[0].filename) };
  }

  async function repack(
    modify: (packageRoot: string) => Promise<void>,
  ): Promise<string> {
    const { destination, tarball } = await pack();
    const extracted = join(destination, 'extracted');
    await mkdir(extracted);
    execFileSync('tar', ['-x', '-z', '-f', tarball, '-C', extracted]);
    await modify(join(extracted, 'package'));
    const modified = join(destination, 'modified.tgz');
    execFileSync('tar', ['-c', '-z', '-f', modified, '-C', extracted, 'package']);
    return modified;
  }

  it('ships a bounded public allowlist with usable source maps', async () => {
    const { tarball } = await pack();
    const report = JSON.parse(execFileSync(
      'node',
      ['scripts/verify-packed-artifact.mjs', tarball],
      { encoding: 'utf8' },
    )) as { name: string; version: string; sourceMapCount: number; readmeRelativeLinkCount: number };
    expect(report).toMatchObject({
      name: 'borgmcp-shared',
      version: '1.0.0',
    });
    expect(report.sourceMapCount).toBeGreaterThan(0);
    expect(report.readmeRelativeLinkCount).toBeGreaterThan(0);
  });

  it('requires the release ledger linked by the packed README', async () => {
    const tarball = await repack(async (root) => {
      await rm(join(root, 'RELEASES.md'));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing RELEASES.md');
  });

  it('rejects any relative README link whose target is absent from the tarball', async () => {
    const tarball = await repack(async (root) => {
      const readmePath = join(root, 'README.md');
      const readme = await readFile(readmePath, 'utf8');
      await writeFile(readmePath, `${readme}\n[Missing](docs/missing.md)\n`);
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('README relative link target is not shipped: docs/missing.md');
  });

  it('ships operator-controlled ownership across coordinating roles', async () => {
    const { destination, tarball } = await pack();
    const consumer = join(destination, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: 'borgmcp-shared-template-consumer',
      private: true,
      version: '0.0.0',
    }));
    execFileSync('npm', [
      'install',
      '--prefix',
      consumer,
      '--ignore-scripts',
      '--no-save',
      tarball,
    ], { stdio: 'pipe', env: materializeNpmEnv });

    const coordinatingRoles = JSON.parse(execFileSync('node', [
      '--input-type=module',
      '--eval',
      "import { TEMPLATES } from 'borgmcp-shared/templates'; process.stdout.write(JSON.stringify([TEMPLATES['software-dev'].roles.find(({ name }) => name === 'Coordinator').detailed_description,TEMPLATES.starter.roles.find(({ name }) => name === 'Coordinator').detailed_description,TEMPLATES['local-model'].roles.find(({ name }) => name === 'Director').detailed_description]));",
    ], { cwd: consumer, encoding: 'utf8' })) as string[];

    for (const role of coordinatingRoles) {
      expect(role).toContain('one direct status request');
      expect(role).toContain('report the evidence to the human');
      expect(role).toContain(
        'requires explicit human operator approval for the exact work item and recipient',
      );
      expect(role).not.toMatch(/within 2 minutes|After 5 more minutes|every 10 minutes/i);
    }
    expect(coordinatingRoles[0].length).toBeLessThanOrEqual(45_000);
  });

  it('ships the named-template cube-creation contract and presentation copy', async () => {
    const { destination, tarball } = await pack();
    const consumer = join(destination, 'creation-contract-consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: 'borgmcp-shared-creation-contract-consumer',
      private: true,
      version: '0.0.0',
    }));
    execFileSync('npm', [
      'install',
      '--prefix',
      consumer,
      '--ignore-scripts',
      '--no-save',
      tarball,
    ], { stdio: 'pipe', env: materializeNpmEnv });

    const report = JSON.parse(execFileSync('node', [
      '--input-type=module',
      '--eval',
      `
        import {
          CUBE_TEMPLATES,
          ErrorCode,
          PROTOCOL_VERSION,
          decodeAppendLogRequest,
          decodeAssociateRepositoryCubeRequest,
          decodeCreateCubeRequest,
          decodeDeleteCubeRequest,
          decodeDeleteCubeResponse,
          decodePutDocumentRequest,
          decodeResolveRepositoryCubeResponse,
        } from 'borgmcp-shared/protocol';
        import {
          LEGACY_DEFAULT_TEMPLATE_LABEL,
          NEW_CUBE_TEMPLATE_PRESENTATIONS,
          TEMPLATES,
        } from 'borgmcp-shared/templates';
        import {
          CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE,
          DELETE_CUBE_CONFORMANCE,
        } from 'borgmcp-shared/conformance';
        const request = decodeCreateCubeRequest({
          retry_key: '00000000-0000-4000-8000-000000000001',
          name: 'Repository Cube',
          working_repo_name: 'repository',
          repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000002' },
          template: 'software-dev',
        });
        const association = decodeAssociateRepositoryCubeRequest({
          cube_id: '00000000-0000-4000-8000-000000000003',
          working_repo_name: 'repository',
          repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000002' },
        });
        let omittedAddressingRefused = false;
        let retiredAddressingRefused = false;
        try {
          decodeAppendLogRequest({
            post_id: '00000000-0000-4000-8000-000000000004',
            message: 'missing audience',
          });
        } catch {
          omittedAddressingRefused = true;
        }
        try {
          decodeAppendLogRequest({
            post_id: '00000000-0000-4000-8000-000000000005',
            message: 'retired audience',
            to: 'broadcast',
            visibility: 'broadcast',
          });
        } catch {
          retiredAddressingRefused = true;
        }
        process.stdout.write(JSON.stringify({
          templates: CUBE_TEMPLATES,
          templateAcceptance: CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE,
          protocolVersion: PROTOCOL_VERSION,
          appendRequest: decodeAppendLogRequest({
            post_id: '00000000-0000-4000-8000-000000000004',
            message: 'explicit audience',
            to: ['Builder'],
          }),
          omittedAddressingRefused,
          retiredAddressingRefused,
          classificationOnlyTaxonomies: Object.values(TEMPLATES).every((template) =>
            template.message_taxonomy?.every((entry) =>
              Object.keys(entry).every((key) => ['class', 'prefixes', 'lifecycle'].includes(key))
            )
          ),
          explicitAddressingPlaybooks: Object.values(TEMPLATES).every((template) =>
            template.roles.every((role) =>
              role.detailed_description.includes('Every borg_log call must set structured \`to:\`') &&
              role.detailed_description.includes('\`to: "broadcast"\`')
            )
          ),
          deleteRequest: decodeDeleteCubeRequest({}),
          deleteResponse: decodeDeleteCubeResponse({
            cube_id: '00000000-0000-4000-8000-000000000003',
            deleted: true,
          }),
          cubeDeletedCode: ErrorCode.CUBE_DELETED,
          deletionVectorCount: DELETE_CUBE_CONFORMANCE.length,
          documentRequest: decodePutDocumentRequest({
            title: 'Packed evidence',
            content_type: 'text/plain',
            content: 'Exact installed contract.',
          }),
          request,
          association,
          unresolved: decodeResolveRepositoryCubeResponse({ result: 'none' }),
          legacyLabel: LEGACY_DEFAULT_TEMPLATE_LABEL,
          presentations: NEW_CUBE_TEMPLATE_PRESENTATIONS,
          softwareDevelopment: {
            label: TEMPLATES['software-dev'].label,
            description: TEMPLATES['software-dev'].short_description,
          },
          starter: {
            label: TEMPLATES.starter.label,
            description: TEMPLATES.starter.short_description,
          },
          localModel: {
            label: TEMPLATES['local-model'].label,
            description: TEMPLATES['local-model'].short_description,
            roles: TEMPLATES['local-model'].roles.map(({ name }) => name),
            roleText: Object.fromEntries(
              TEMPLATES['local-model'].roles.map(({ name, detailed_description }) => [
                name,
                detailed_description,
              ]),
            ),
          },
        }));
      `,
    ], { cwd: consumer, encoding: 'utf8' }));

    expect(report.localModel.roleText.Director).toContain(
      'ends with APPROVED, or with BLOCKED',
    );
    expect(report.localModel.roleText.Shaper).toContain('Run every packet check yourself');
    expect(report.localModel.roleText.Executor).toContain(
      'An active packet ends only with SPEC-GAP or PACKET-DONE',
    );
    expect(report.localModel.roleText.Executor).toContain('A REJECT is not a packet');
    delete report.localModel.roleText;

    expect(report).toEqual({
      templates: ['default', 'software-dev', 'starter', 'local-model'],
      templateAcceptance: [
        { name: 'accepts the legacy default template', template: 'default', accepts: true },
        { name: 'accepts the software-development template', template: 'software-dev', accepts: true },
        { name: 'accepts the starter template', template: 'starter', accepts: true },
        { name: 'accepts the local-model template', template: 'local-model', accepts: true },
        { name: 'rejects an unknown template name', template: 'custom', accepts: false },
        { name: 'rejects a non-string template', template: null, accepts: false },
      ],
      protocolVersion: '12',
      appendRequest: {
        post_id: '00000000-0000-4000-8000-000000000004',
        message: 'explicit audience',
        to: ['Builder'],
      },
      omittedAddressingRefused: true,
      retiredAddressingRefused: true,
      classificationOnlyTaxonomies: true,
      explicitAddressingPlaybooks: true,
      deleteRequest: {},
      deleteResponse: {
        cube_id: '00000000-0000-4000-8000-000000000003',
        deleted: true,
      },
      cubeDeletedCode: 'CUBE_DELETED',
      deletionVectorCount: 5,
      documentRequest: {
        title: 'Packed evidence',
        content_type: 'text/plain',
        content: 'Exact installed contract.',
      },
      request: {
        retry_key: '00000000-0000-4000-8000-000000000001',
        name: 'Repository Cube',
        working_repo_name: 'repository',
        repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000002' },
        template: 'software-dev',
      },
      association: {
        cube_id: '00000000-0000-4000-8000-000000000003',
        working_repo_name: 'repository',
        repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000002' },
      },
      unresolved: { result: 'none' },
      legacyLabel: 'Default (legacy)',
      presentations: [
        {
          name: 'software-dev',
          label: 'Software Development',
          short_description: 'Recommended for code repositories.',
        },
        {
          name: 'starter',
          label: 'Starter',
          short_description: 'Minimal roles for general projects.',
        },
        {
          name: 'local-model',
          label: 'Local Model',
          short_description: 'Maximizes local-model execution through complete, machine-checkable work packets.',
        },
      ],
      softwareDevelopment: {
        label: 'Software Development',
        description: 'Recommended for code repositories.',
      },
      starter: {
        label: 'Starter',
        description: 'Minimal roles for general projects.',
      },
      localModel: {
        label: 'Local Model',
        description: 'Maximizes local-model execution through complete, machine-checkable work packets.',
        roles: ['Director', 'Shaper', 'Executor'],
      },
    });
  });

  it('rejects source maps whose referenced source is absent', async () => {
    const tarball = await repack(async (root) => {
      await rm(join(root, 'src/protocol/contract.ts'));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Source map target is not shipped');
  });

  it('rejects a missing public export target', async () => {
    const tarball = await repack(async (root) => {
      await rm(join(root, 'dist/index.js'));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Public export target is not shipped');
  });

  it('fails to import an exact installed tarball with a missing runtime module', async () => {
    const tarball = await repack(async (root) => {
      await writeFile(join(root, 'dist/index.js'), "import './missing-runtime.js';\n");
    });
    const consumer = await mkdtemp(join(tmpdir(), 'borgmcp-shared-broken-consumer-'));
    temporaryDirectories.push(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({
      name: 'borgmcp-shared-broken-consumer',
      private: true,
      version: '0.0.0',
      dependencies: { 'borgmcp-shared': '1.0.0' },
    }));
    execFileSync('npm', [
      'install',
      '--prefix',
      consumer,
      '--ignore-scripts',
      '--no-save',
      tarball,
    ], { stdio: 'pipe', env: materializeNpmEnv });
    execFileSync('npm', ['ls', '--prefix', consumer, '--omit=dev', '--all'], { stdio: 'pipe' });
    const result = spawnSync('node', [
      '--input-type=module',
      '--eval',
      "await import('borgmcp-shared');",
    ], { cwd: consumer, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('missing-runtime.js');
  });

  it('rejects an altered public export map', async () => {
    const tarball = await repack(async (root) => {
      const manifestPath = join(root, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.exports['./unexpected'] = './dist/index.js';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('entrypoints do not match');
  });

  it.each([
    ['embedded source content', { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: ['source.ts'], sourcesContent: ['secret'] } }] }],
    ['outside source', { version: 3, sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, sources: ['../../../../private.ts'] } }] }],
  ])('rejects an indexed source map with nested %s', async (_description, indexedMap) => {
    const tarball = await repack(async (root) => {
      await writeFile(join(root, 'dist/protocol/version.js.map'), JSON.stringify(indexedMap));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Indexed source maps are forbidden');
  });

  it.each(['/tmp/private.ts', 'C:\\private.ts', '../../../../private.ts'])(
    'rejects an absolute or outside source-map target: %s',
    async (source) => {
      const tarball = await repack(async (root) => {
        const mapPath = join(root, 'dist/protocol/version.js.map');
        const sourceMap = JSON.parse(await readFile(mapPath, 'utf8'));
        sourceMap.sources = [source];
        await writeFile(mapPath, JSON.stringify(sourceMap));
      });
      const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Source map (?:source must be relative|target is not shipped)/);
    },
  );

  it.each([
    ['wrong version', { version: 2, sources: ['source.ts'] }, 'version 3 object format'],
    ['non-string source', { version: 3, sources: [42] }, 'sources must be non-empty strings'],
  ])('rejects a source map with %s', async (_description, invalidMap, message) => {
    const tarball = await repack(async (root) => {
      await writeFile(join(root, 'dist/protocol/version.js.map'), JSON.stringify(invalidMap));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
  });

  it.each(['prepare', 'prepublish'])('rejects the %s consumer lifecycle hook', async (hook) => {
    const tarball = await repack(async (root) => {
      const manifestPath = join(root, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.scripts[hook] = 'npm run build';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Forbidden consumer lifecycle hook: ${hook}`);
  });

  it.each([
    ['credential-shaped token', `npm_${'a'.repeat(32)}`],
    ['retired service domain', 'https://api.borgmcp.ai/private'],
    ['retired service domain', 'https://borgmcp.ai'],
    ['retired dual-authority conformance API', 'runEquivalentAdapterConformance'],
    ['retired product topology', 'cloud authority'],
    ['hosted authority terminology', 'OAuth'],
    ['hosted account terminology', 'billing path'],
    ['retired credential storage', 'keychain'],
  ])('rejects %s hidden in a source map', async (description, hiddenContent) => {
    const tarball = await repack(async (root) => {
      const mapPath = join(root, 'dist/protocol/version.js.map');
      const sourceMap = JSON.parse(await readFile(mapPath, 'utf8'));
      sourceMap.x_hidden = hiddenContent;
      await writeFile(mapPath, JSON.stringify(sourceMap));
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(description);
  });

  it('rejects registry redirects in package metadata', async () => {
    const tarball = await repack(async (root) => {
      const manifestPath = join(root, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.publishConfig.registry = 'https://registry.invalid';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    });
    const result = spawnSync('node', ['scripts/verify-packed-artifact.mjs', tarball], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('registry redirects are forbidden');
  });
});
