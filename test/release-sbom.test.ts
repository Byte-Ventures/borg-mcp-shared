import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('release SBOM', () => {
  let directory: string;
  let original: Record<string, any>;
  let verifierPath: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'borgmcp-shared-sbom-'));
    verifierPath = join(process.cwd(), 'scripts/verify-release-sbom.mjs');
    const rawPath = join(directory, 'raw.cdx.json');
    const normalizedPath = join(directory, 'normalized.cdx.json');
    await writeFile(rawPath, execFileSync(
      'npm',
      ['sbom', '--sbom-format', 'cyclonedx'],
      { encoding: 'utf8' },
    ));
    execFileSync('node', ['scripts/normalize-release-sbom.mjs', rawPath, normalizedPath]);
    original = JSON.parse(await readFile(normalizedPath, 'utf8'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function verify(
    name: string,
    mutate?: (sbom: Record<string, any>) => void,
  ) {
    const sbom = structuredClone(original);
    mutate?.(sbom);
    const path = join(directory, `${name}.cdx.json`);
    await writeFile(path, `${JSON.stringify(sbom)}\n`);
    return spawnSync('node', [verifierPath, path], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  }

  it('binds identity, lock components, dependency graph, and zero runtime dependencies', async () => {
    const result = await verify('valid');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      name: 'borgmcp-shared',
      version: '0.3.0',
      format: 'CycloneDX-1.5',
      runtimeDependencies: 0,
    });
  });

  it('accepts npm 11 SBOM components without package-path properties', async () => {
    const result = await verify('npm-11-shape', (sbom) => {
      for (const component of sbom.components) {
        component.properties = component.properties.filter(
          (property: { name: string }) => property.name !== 'cdx:npm:package:path',
        );
      }
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a substituted root package identity', async () => {
    const result = await verify('wrong-root', (sbom) => {
      sbom.metadata.component.name = 'substituted-package';
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('root component');
  });

  it('rejects a component that diverges from the lockfile', async () => {
    const result = await verify('wrong-component', (sbom) => {
      sbom.components[0].version = '999.0.0';
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('lock entry');
  });

  it('rejects a component purl that diverges from the lockfile', async () => {
    const result = await verify('wrong-purl', (sbom) => {
      sbom.components[0].purl = 'pkg:npm/substituted@999.0.0';
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('lock entry');
  });

  it('rejects a dependency graph that diverges from the installed locked tree', async () => {
    const result = await verify('wrong-graph', (sbom) => {
      const root = sbom.dependencies.find(
        (dependency: { ref: string }) => dependency.ref === 'borgmcp-shared@0.3.0',
      );
      root.dependsOn = root.dependsOn.slice(1);
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dependency edges');
  });

  it.each([
    ['missing integrity', (lock: Record<string, any>, path: string) => delete lock.packages[path].integrity, 'SHA-512 integrity'],
    ['non-registry source', (lock: Record<string, any>, path: string) => { lock.packages[path].resolved = 'git+https://example.invalid/dependency.git'; }, 'canonical npm registry'],
  ] as const)('rejects a lock component with %s', async (_name, mutate, diagnostic) => {
    const caseDirectory = join(directory, _name.replaceAll(' ', '-'));
    await mkdir(caseDirectory);
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    const componentPath = Object.keys(lock.packages).find((path) => path !== '');
    if (!componentPath) throw new Error('Fixture lockfile has no dependency component.');
    mutate(lock, componentPath);
    const sbomPath = join(caseDirectory, 'sbom.cdx.json');
    await writeFile(join(caseDirectory, 'package.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(caseDirectory, 'package-lock.json'), `${JSON.stringify(lock)}\n`);
    await writeFile(sbomPath, `${JSON.stringify(original)}\n`);
    const result = spawnSync('node', [verifierPath, sbomPath], {
      cwd: caseDirectory,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(diagnostic);
  });
});
