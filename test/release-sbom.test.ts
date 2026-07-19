import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VERSION = '0.4.2';
const DEPENDENCY_VERSION = '1.0.0';
const INTEGRITY = `sha512-${Buffer.alloc(64).toString('base64')}`;
const HASH = Buffer.alloc(64).toString('hex');

function packageEntry(name: string, extra: Record<string, unknown> = {}) {
  return {
    version: DEPENDENCY_VERSION,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${DEPENDENCY_VERSION}.tgz`,
    integrity: INTEGRITY,
    dev: true,
    ...extra,
  };
}

function createLock(): Record<string, any> {
  return {
    name: 'borgmcp-shared',
    version: VERSION,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'borgmcp-shared',
        version: VERSION,
        license: 'Apache-2.0',
        devDependencies: {
          bundler: DEPENDENCY_VERSION,
          'test-tool': DEPENDENCY_VERSION,
        },
      },
      'node_modules/bundler': packageEntry('bundler', {
        dependencies: { 'core-lib': '^1.0.0' },
        optionalDependencies: {
          'native-linux': DEPENDENCY_VERSION,
          'native-darwin': DEPENDENCY_VERSION,
          'native-linux-musl': DEPENDENCY_VERSION,
        },
        peerDependencies: {
          'required-peer': '^1.0.0',
          'optional-peer': '^1.0.0',
        },
        peerDependenciesMeta: { 'optional-peer': { optional: true } },
      }),
      'node_modules/test-tool': packageEntry('test-tool', {
        dependencies: { 'optional-peer': '^1.0.0' },
      }),
      'node_modules/core-lib': packageEntry('core-lib'),
      'node_modules/required-peer': packageEntry('required-peer'),
      'node_modules/optional-peer': packageEntry('optional-peer'),
      'node_modules/native-linux': packageEntry('native-linux', {
        optional: true,
        os: ['linux', '!darwin'],
        cpu: ['x64'],
        libc: ['glibc'],
      }),
      'node_modules/native-darwin': packageEntry('native-darwin', {
        optional: true,
        os: ['darwin'],
        cpu: ['arm64'],
      }),
      'node_modules/native-linux-musl': packageEntry('native-linux-musl', {
        optional: true,
        os: ['linux'],
        cpu: ['x64'],
        libc: ['musl'],
      }),
    },
  };
}

function component(name: string) {
  const ref = `${name}@${DEPENDENCY_VERSION}`;
  return {
    type: 'library',
    name,
    version: DEPENDENCY_VERSION,
    'bom-ref': ref,
    purl: `pkg:npm/${name}@${DEPENDENCY_VERSION}`,
    hashes: [{ alg: 'SHA-512', content: HASH }],
    externalReferences: [{
      type: 'distribution',
      url: `https://registry.npmjs.org/${name}/-/${name}-${DEPENDENCY_VERSION}.tgz`,
    }],
    properties: [{ name: 'cdx:npm:package:path', value: `node_modules/${name}` }],
  };
}

function createSbom(platform: 'linux' | 'darwin' = 'linux') {
  const native = platform === 'linux' ? 'native-linux' : 'native-darwin';
  const names = ['bundler', 'test-tool', 'core-lib', 'required-peer', 'optional-peer', native];
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    metadata: {
      component: {
        type: 'application',
        name: 'borgmcp-shared',
        version: VERSION,
        'bom-ref': `borgmcp-shared@${VERSION}`,
        purl: `pkg:npm/borgmcp-shared@${VERSION}`,
      },
    },
    components: names.map(component),
    dependencies: [
      { ref: `borgmcp-shared@${VERSION}`, dependsOn: [`bundler@${DEPENDENCY_VERSION}`, `test-tool@${DEPENDENCY_VERSION}`] },
      { ref: `bundler@${DEPENDENCY_VERSION}`, dependsOn: [
        `core-lib@${DEPENDENCY_VERSION}`,
        `${native}@${DEPENDENCY_VERSION}`,
        `optional-peer@${DEPENDENCY_VERSION}`,
        `required-peer@${DEPENDENCY_VERSION}`,
      ] },
      { ref: `test-tool@${DEPENDENCY_VERSION}`, dependsOn: [`optional-peer@${DEPENDENCY_VERSION}`] },
      { ref: `core-lib@${DEPENDENCY_VERSION}`, dependsOn: [] },
      { ref: `required-peer@${DEPENDENCY_VERSION}`, dependsOn: [] },
      { ref: `optional-peer@${DEPENDENCY_VERSION}`, dependsOn: [] },
      { ref: `${native}@${DEPENDENCY_VERSION}`, dependsOn: [] },
    ],
  };
}

describe('release SBOM', () => {
  let directory: string;
  let verifierPath: string;
  const manifest = {
    name: 'borgmcp-shared',
    version: VERSION,
    devDependencies: { bundler: DEPENDENCY_VERSION, 'test-tool': DEPENDENCY_VERSION },
  };

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'borgmcp-shared-sbom-'));
    verifierPath = join(process.cwd(), 'scripts/verify-release-sbom.mjs');
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function verify(
    name: string,
    options: {
      sbom?: Record<string, any>;
      lock?: Record<string, any>;
      manifest?: Record<string, any>;
    } = {},
  ) {
    const caseDirectory = join(directory, name);
    await mkdir(caseDirectory);
    const sbomPath = join(caseDirectory, 'sbom.cdx.json');
    await writeFile(join(caseDirectory, 'package.json'), `${JSON.stringify(options.manifest ?? manifest)}\n`);
    await writeFile(join(caseDirectory, 'package-lock.json'), `${JSON.stringify(options.lock ?? createLock())}\n`);
    await writeFile(sbomPath, `${JSON.stringify(options.sbom ?? createSbom())}\n`);
    return spawnSync(process.execPath, [verifierPath, sbomPath], {
      cwd: caseDirectory,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent' },
    });
  }

  it('verifies the fixed Linux x64 glibc fixture without npm or node_modules', async () => {
    const result = await verify('linux-cross-platform');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      name: 'borgmcp-shared',
      version: VERSION,
      components: 6,
      dependencyNodes: 7,
      runtimeDependencies: 0,
      releaseTarget: { os: 'linux', cpu: 'x64', libc: 'glibc' },
    });
  });

  it('rejects a Darwin dependency tree substituted for the release target', async () => {
    const result = await verify('darwin-substitution', { sbom: createSbom('darwin') });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release-target tree');
  });

  it('contains no installed-tree or child-process fallback', async () => {
    const source = await readFile(verifierPath, 'utf8');
    expect(source).not.toContain('node:child_process');
    expect(source).not.toMatch(/npm[^\n]*\bls\b/);
    expect(source).not.toContain('process.platform');
    expect(source).not.toContain('process.arch');
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
    expect(workflow).toContain('RELEASE_TARGET_OS: linux');
    expect(workflow).toContain('RELEASE_TARGET_CPU: x64');
    expect(workflow).toContain('RELEASE_TARGET_LIBC: glibc');
    const ci = await readFile('.github/workflows/ci.yml', 'utf8');
    expect(ci).toContain('os: [ubuntu-latest, macos-latest]');
    expect(ci).toContain('npx vitest run test/release-sbom.test.ts');
  });

  it('accepts npm 11 components without package-path properties', async () => {
    const sbom = createSbom();
    for (const entry of sbom.components) entry.properties = [];
    const result = await verify('npm-11-shape', { sbom });
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects a substituted root package identity', async () => {
    const sbom = createSbom();
    sbom.metadata.component.name = 'substituted-package';
    const result = await verify('wrong-root', { sbom });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('root component');
  });

  it('rejects omitted, extra, or duplicate components', async () => {
    for (const [name, mutate, diagnostic] of [
      ['omitted', (sbom: any) => sbom.components.pop(), 'components'],
      ['extra', (sbom: any) => sbom.components.push(component('unknown')), 'absent from package-lock'],
      ['duplicate', (sbom: any) => sbom.components.push(structuredClone(sbom.components[0])), 'Duplicate SBOM component'],
    ] as const) {
      const sbom = createSbom();
      mutate(sbom);
      const result = await verify(`component-${name}`, { sbom });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(diagnostic);
    }
  });

  it('rejects omitted, extra, or duplicate dependency edges and nodes', async () => {
    for (const [name, mutate, diagnostic] of [
      ['omitted-edge', (sbom: any) => sbom.dependencies[0].dependsOn.pop(), 'dependency edges'],
      ['extra-edge', (sbom: any) => sbom.dependencies[1].dependsOn.push(`test-tool@${DEPENDENCY_VERSION}`), 'dependency edges'],
      ['duplicate-node', (sbom: any) => sbom.dependencies.push(structuredClone(sbom.dependencies[0])), 'Duplicate SBOM dependency node'],
    ] as const) {
      const sbom = createSbom();
      mutate(sbom);
      const result = await verify(`graph-${name}`, { sbom });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(diagnostic);
    }
  });

  it('requires an optional peer when another reachable package installs it', async () => {
    const sbom = createSbom();
    sbom.components = sbom.components.filter((entry) => entry.name !== 'optional-peer');
    sbom.dependencies = sbom.dependencies.filter((entry) => entry.ref !== `optional-peer@${DEPENDENCY_VERSION}`);
    for (const entry of sbom.dependencies) {
      entry.dependsOn = entry.dependsOn.filter((ref) => ref !== `optional-peer@${DEPENDENCY_VERSION}`);
    }
    const result = await verify('required-reachable-optional-peer', { sbom });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('components');
  });

  it('rejects omission of a required peer', async () => {
    const sbom = createSbom();
    sbom.components = sbom.components.filter((entry) => entry.name !== 'required-peer');
    sbom.dependencies = sbom.dependencies.filter((entry) => entry.ref !== `required-peer@${DEPENDENCY_VERSION}`);
    for (const entry of sbom.dependencies) {
      entry.dependsOn = entry.dependsOn.filter((ref) => ref !== `required-peer@${DEPENDENCY_VERSION}`);
    }
    const result = await verify('required-peer-omission', { sbom });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('components');
  });

  it('omits an optional peer when it is not otherwise reachable', async () => {
    const lock = createLock();
    delete lock.packages['node_modules/test-tool'].dependencies;
    const sbom = createSbom();
    sbom.components = sbom.components.filter((entry) => entry.name !== 'optional-peer');
    sbom.dependencies = sbom.dependencies.filter((entry) => entry.ref !== `optional-peer@${DEPENDENCY_VERSION}`);
    for (const entry of sbom.dependencies) {
      entry.dependsOn = entry.dependsOn.filter((ref) => ref !== `optional-peer@${DEPENDENCY_VERSION}`);
    }
    const result = await verify('unreachable-optional-peer', { lock, sbom });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['wrong package', (url: URL) => { url.pathname = '/substituted/-/substituted-999.0.0.tgz'; }],
    ['wrong version', (url: URL) => { url.pathname = url.pathname.replace(/-[^-]+\.tgz$/, '-999.0.0.tgz'); }],
    ['userinfo', (url: URL) => { url.username = 'attacker'; }],
    ['port', (url: URL) => { url.port = '444'; }],
    ['query', (url: URL) => { url.search = '?attacker=1'; }],
    ['fragment', (url: URL) => { url.hash = '#attacker'; }],
  ])('rejects a component distribution URL with %s substitution', async (name, mutate) => {
    const sbom = createSbom();
    const reference = sbom.components[0].externalReferences[0];
    const url = new URL(reference.url);
    mutate(url);
    reference.url = url.href;
    const result = await verify(`distribution-${name}`, { sbom });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('distribution reference');
  });

  it('rejects component hash drift', async () => {
    const sbom = createSbom();
    sbom.components[0].hashes[0].content = 'f'.repeat(128);
    const result = await verify('hash-drift', { sbom });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SHA-512');
  });

  it('rejects a dependency version mismatch', async () => {
    const lock = createLock();
    lock.packages[''].devDependencies.bundler = '2.0.0';
    const result = await verify('version-mismatch', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('version mismatch');
  });

  it('rejects a missing required dependency', async () => {
    const lock = createLock();
    delete lock.packages['node_modules/required-peer'];
    const result = await verify('missing-required-dependency', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('dependency is missing');
  });

  it('rejects an ambiguous lock identity', async () => {
    const lock = createLock();
    lock.packages['node_modules/bundler/node_modules/core-lib'] = packageEntry('core-lib');
    const result = await verify('ambiguous-lock-identity', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('identity is ambiguous');
  });

  it('requires package-lock version 3', async () => {
    const lock = createLock();
    lock.lockfileVersion = 2;
    const result = await verify('lockfile-version', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('lockfileVersion 3');
  });

  it('rejects a lock root incompatible with the fixed release target', async () => {
    const lock = createLock();
    lock.packages[''].os = ['darwin'];
    const result = await verify('incompatible-lock-root', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('root is incompatible');
  });

  it('rejects manifest and lock root selector drift', async () => {
    const changedManifest = { ...manifest, os: ['linux'] };
    const result = await verify('root-selector-drift', { manifest: changedManifest });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('selectors do not match');
  });

  it('accepts matching manifest and lock selectors for the fixed target', async () => {
    const selectors = { os: ['linux'], cpu: ['x64'], libc: ['glibc'] };
    const changedManifest = { ...manifest, ...selectors };
    const lock = createLock();
    Object.assign(lock.packages[''], selectors);
    const result = await verify('bound-root-selectors', { manifest: changedManifest, lock });
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['empty', []],
    ['empty-value', ['']],
    ['bare-negation', ['!']],
    ['duplicate', ['linux', 'linux']],
    ['contradictory', ['linux', '!linux']],
  ])('rejects %s platform constraints', async (name, selectors) => {
    const lock = createLock();
    lock.packages['node_modules/native-linux'].os = selectors;
    const result = await verify(`selector-${name}`, { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/selectors/);
  });

  it('rejects release-target constraint inversion', async () => {
    const lock = createLock();
    lock.packages['node_modules/native-linux'].libc = ['musl'];
    const result = await verify('constraint-inversion', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('components');
  });

  it('rejects a required dependency incompatible with the release target', async () => {
    const lock = createLock();
    lock.packages['node_modules/core-lib'].os = ['darwin'];
    const result = await verify('required-target-incompatible', { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Required dependency is incompatible');
  });

  it.each([
    ['missing integrity', (entry: any) => delete entry.integrity, 'SHA-512 integrity'],
    ['non-registry source', (entry: any) => { entry.resolved = 'git+https://example.invalid/dependency.git'; }, 'canonical npm registry tarball URL'],
    ['registry query', (entry: any) => { entry.resolved += '?attacker=1'; }, 'canonical npm registry tarball URL'],
  ])('rejects a lock component with %s', async (name, mutate, diagnostic) => {
    const lock = createLock();
    mutate(lock.packages['node_modules/bundler']);
    const result = await verify(`lock-${name}`, { lock });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(diagnostic);
  });
});
