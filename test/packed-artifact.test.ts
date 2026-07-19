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
    )) as { name: string; version: string; sourceMapCount: number };
    expect(report).toMatchObject({
      name: 'borgmcp-shared',
      version: '0.4.0',
    });
    expect(report.sourceMapCount).toBeGreaterThan(0);
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
      dependencies: { 'borgmcp-shared': '0.4.0' },
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
