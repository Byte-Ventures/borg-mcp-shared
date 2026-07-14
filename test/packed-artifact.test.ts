import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

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
      { encoding: 'utf8' },
    )) as Array<{ filename: string }>;
    return { destination, tarball: join(destination, result[0].filename) };
  }

  async function repack(
    modify: (packageRoot: string) => Promise<void>,
  ): Promise<string> {
    const { destination, tarball } = await pack();
    const extracted = join(destination, 'extracted');
    await mkdir(extracted);
    execFileSync('tar', ['-xzf', tarball, '-C', extracted]);
    await modify(join(extracted, 'package'));
    const modified = join(destination, 'modified.tgz');
    execFileSync('tar', ['-czf', modified, '-C', extracted, 'package']);
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
      version: '0.2.0',
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
    ['private backend URL', 'https://api.borgmcp.ai/private'],
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
