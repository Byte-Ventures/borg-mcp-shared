import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_SBOM_BYTES = 10 * 1024 * 1024;
export const RELEASE_TARGET = Object.freeze({ os: 'linux', cpu: 'x64', libc: 'glibc' });
const RUNTIME_DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
];

function fail(message) {
  throw new Error(message);
}

function packageNameFromLockPath(path) {
  return path.split('node_modules/').at(-1);
}

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function parseVersion(value) {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ?? null,
  };
}

function compareVersions(left, right) {
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease, 'en', { numeric: true });
}

function satisfiesComparator(version, comparator) {
  if (comparator === '*') return true;
  const operator = comparator.startsWith('>=') ? '>=' : comparator[0] === '^' || comparator[0] === '~'
    ? comparator[0]
    : '=';
  const required = parseVersion(comparator.slice(operator === '>=' ? 2 : operator === '=' ? 0 : 1));
  if (!required) fail(`Unsupported package-lock dependency version: ${comparator}`);
  const lowerComparison = compareVersions(version, required);
  if (operator === '=') return lowerComparison === 0;
  if (operator === '>=') return lowerComparison >= 0;
  let upper;
  if (operator === '~') {
    upper = { major: required.major, minor: required.minor + 1, patch: 0, prerelease: null };
  } else if (required.major > 0) {
    upper = { major: required.major + 1, minor: 0, patch: 0, prerelease: null };
  } else if (required.minor > 0) {
    upper = { major: 0, minor: required.minor + 1, patch: 0, prerelease: null };
  } else {
    upper = { major: 0, minor: 0, patch: required.patch + 1, prerelease: null };
  }
  return lowerComparison >= 0 && compareVersions(version, upper) < 0;
}

function satisfiesVersion(versionValue, specification) {
  const version = parseVersion(versionValue);
  if (!version || typeof specification !== 'string') return false;
  return specification.split('||').some((comparator) => (
    satisfiesComparator(version, comparator.trim())
  ));
}

function matchesSelector(values, target, field, path) {
  if (values === undefined) return true;
  if (!Array.isArray(values) || values.length === 0 ||
      values.some((value) => typeof value !== 'string' || !/^!?[a-z0-9][a-z0-9_-]*$/i.test(value))) {
    fail(`Lock component has invalid ${field} selectors: ${path}`);
  }
  const normalized = values.map((value) => value.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    fail(`Lock component has duplicate ${field} selectors: ${path}`);
  }
  const excluded = normalized.filter((value) => value.startsWith('!')).map((value) => value.slice(1));
  const included = normalized.filter((value) => !value.startsWith('!'));
  if (included.some((value) => excluded.includes(value))) {
    fail(`Lock component has contradictory ${field} selectors: ${path}`);
  }
  if (excluded.includes(target)) return false;
  return included.length === 0 || included.includes(target);
}

function matchesReleaseTarget(locked, path) {
  return matchesSelector(locked.os, RELEASE_TARGET.os, 'os', path) &&
    matchesSelector(locked.cpu, RELEASE_TARGET.cpu, 'cpu', path) &&
    matchesSelector(locked.libc, RELEASE_TARGET.libc, 'libc', path);
}

function resolveDependencyPath(packages, parentPath, dependencyName) {
  let ancestor = parentPath;
  while (true) {
    const candidate = ancestor
      ? `${ancestor}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packages.has(candidate)) return candidate;
    if (!ancestor) return null;
    const marker = ancestor.lastIndexOf('/node_modules/');
    ancestor = marker === -1 ? '' : ancestor.slice(0, marker);
  }
}

function buildExpectedGraph(lock, rootRef) {
  if (lock.lockfileVersion !== 3 || !lock.packages || Array.isArray(lock.packages)) {
    fail('package-lock.json must use lockfileVersion 3 with a packages map.');
  }
  const packages = new Map(Object.entries(lock.packages));
  const refByPath = new Map([['', rootRef]]);
  const pathByRef = new Map([[rootRef, '']]);
  for (const [path, locked] of packages) {
    if (path === '') {
      matchesReleaseTarget(locked, '<root>');
      continue;
    }
    if (typeof locked.version !== 'string') fail(`Lock component has no version: ${path}`);
    matchesReleaseTarget(locked, path);
    const ref = `${packageNameFromLockPath(path)}@${locked.version}`;
    if (pathByRef.has(ref)) fail(`Package-lock identity is ambiguous: ${ref}`);
    refByPath.set(path, ref);
    pathByRef.set(ref, path);
  }

  function resolveDeclared(parentPath, name, specification, optionalPeer = false) {
    const path = resolveDependencyPath(packages, parentPath, name);
    if (!path) {
      if (optionalPeer) return null;
      fail(`Package-lock dependency is missing: ${parentPath || '<root>'} -> ${name}`);
    }
    const locked = packages.get(path);
    if (!satisfiesVersion(locked.version, specification)) {
      fail(`Package-lock dependency version mismatch: ${parentPath || '<root>'} -> ${name}@${specification}`);
    }
    return path;
  }

  function declarations(path) {
    const locked = packages.get(path);
    const optional = locked.optionalDependencies ?? {};
    const required = {
      ...(locked.dependencies ?? {}),
      ...(path === '' ? locked.devDependencies ?? {} : {}),
    };
    for (const name of Object.keys(optional)) delete required[name];
    const peers = locked.peerDependencies ?? {};
    const optionalPeers = new Set(Object.entries(locked.peerDependenciesMeta ?? {})
      .filter(([, metadata]) => metadata?.optional === true)
      .map(([name]) => name));
    return { required, optional, peers, optionalPeers };
  }

  const reachable = new Set(['']);
  const queue = [''];
  while (queue.length > 0) {
    const path = queue.shift();
    const { required, optional, peers, optionalPeers } = declarations(path);
    const additions = [];
    for (const [name, specification] of Object.entries(required)) {
      const target = resolveDeclared(path, name, specification);
      if (!matchesReleaseTarget(packages.get(target), target)) {
        fail(`Required dependency is incompatible with the release target: ${path || '<root>'} -> ${name}`);
      }
      additions.push(target);
    }
    for (const [name, specification] of Object.entries(optional)) {
      const target = resolveDeclared(path, name, specification);
      if (matchesReleaseTarget(packages.get(target), target)) additions.push(target);
    }
    for (const [name, specification] of Object.entries(peers)) {
      if (optionalPeers.has(name)) continue;
      const target = resolveDeclared(path, name, specification);
      if (!matchesReleaseTarget(packages.get(target), target)) {
        fail(`Required peer is incompatible with the release target: ${path || '<root>'} -> ${name}`);
      }
      additions.push(target);
    }
    for (const target of additions) {
      if (reachable.has(target)) continue;
      reachable.add(target);
      queue.push(target);
    }
  }

  const graph = new Map();
  for (const path of reachable) {
    const { required, optional, peers, optionalPeers } = declarations(path);
    const targets = [];
    for (const [name, specification] of Object.entries(required)) {
      targets.push(resolveDeclared(path, name, specification));
    }
    for (const [name, specification] of Object.entries(optional)) {
      const target = resolveDeclared(path, name, specification);
      if (matchesReleaseTarget(packages.get(target), target)) targets.push(target);
    }
    for (const [name, specification] of Object.entries(peers)) {
      const target = resolveDeclared(path, name, specification, optionalPeers.has(name));
      if (target && (!optionalPeers.has(name) || reachable.has(target))) targets.push(target);
    }
    graph.set(refByPath.get(path), [...new Set(targets.map((target) => refByPath.get(target)))].sort());
  }
  return { graph, pathByRef };
}

function expectedPurl(name, version) {
  const encodedName = encodeURIComponent(name).replaceAll('%2F', '/');
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function expectedTarballUrl(name, version) {
  const unscopedName = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  return `https://registry.npmjs.org/${name}/-/${unscopedName}-${version}.tgz`;
}

function requireCanonicalTarballUrl(value, name, version, description) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${description} is not a valid URL.`);
  }
  const expected = expectedTarballUrl(name, version);
  if (value !== expected || parsed.protocol !== 'https:' ||
      parsed.hostname !== 'registry.npmjs.org' || parsed.port !== '' ||
      parsed.username !== '' || parsed.password !== '' ||
      parsed.search !== '' || parsed.hash !== '') {
    fail(`${description} is not the exact canonical npm registry tarball URL: ${name}@${version}`);
  }
  return expected;
}

export async function verifyReleaseSbom(sbomPath) {
  if (!sbomPath) fail('Usage: verify-release-sbom.mjs <cyclonedx-json>');
  const raw = await readFile(resolve(sbomPath));
  if (raw.byteLength === 0 || raw.byteLength > MAX_SBOM_BYTES) {
    fail(`SBOM size must be between 1 and ${MAX_SBOM_BYTES} bytes.`);
  }

  const sbom = JSON.parse(raw.toString('utf8'));
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const rootRef = `${manifest.name}@${manifest.version}`;

  if (manifest.name !== 'borgmcp-shared' || manifest.version !== '0.6.1') {
    fail(`Unexpected package identity: ${rootRef}`);
  }
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value !== undefined && (Array.isArray(value) ? value.length : Object.keys(value).length) > 0) {
      fail(`Package runtime dependency field must be empty: ${field}`);
    }
  }
  if (lock.name !== manifest.name || lock.version !== manifest.version ||
      lock.packages?.['']?.name !== manifest.name ||
      lock.packages?.['']?.version !== manifest.version) {
    fail('Root package-lock identity does not match package.json.');
  }
  if (!matchesReleaseTarget(manifest, 'package.json')) {
    fail('package.json root is incompatible with the fixed release target.');
  }
  if (!matchesReleaseTarget(lock.packages[''], 'package-lock.json root')) {
    fail('package-lock.json root is incompatible with the fixed release target.');
  }
  for (const field of ['os', 'cpu', 'libc']) {
    const manifestSelectors = manifest[field];
    const lockSelectors = lock.packages[''][field];
    const match = manifestSelectors === undefined && lockSelectors === undefined ||
      Array.isArray(manifestSelectors) && Array.isArray(lockSelectors) &&
      sameStrings(
        manifestSelectors.map((value) => value.toLowerCase()),
        lockSelectors.map((value) => value.toLowerCase()),
      );
    if (!match) fail(`Root package ${field} selectors do not match package-lock.json.`);
  }
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const value = lock.packages[''][field];
    if (value !== undefined && (Array.isArray(value) ? value.length : Object.keys(value).length) > 0) {
      fail(`Root lock runtime dependency field must be empty: ${field}`);
    }
  }

  for (const [path, locked] of Object.entries(lock.packages).filter(([path]) => path !== '')) {
    const name = packageNameFromLockPath(path);
    if (typeof locked.resolved !== 'string') {
      fail(`Lock component has no canonical npm registry tarball URL: ${path}`);
    }
    requireCanonicalTarballUrl(locked.resolved, name, locked.version, `Lock component ${path}`);
    if (typeof locked.integrity !== 'string' ||
        !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(locked.integrity)) {
      fail(`Lock component has no canonical SHA-512 integrity: ${path}`);
    }
    const encodedIntegrity = locked.integrity.slice('sha512-'.length);
    const decodedIntegrity = Buffer.from(encodedIntegrity, 'base64');
    if (decodedIntegrity.byteLength !== 64 || decodedIntegrity.toString('base64') !== encodedIntegrity) {
      fail(`Lock component has invalid SHA-512 integrity: ${path}`);
    }
  }

  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5' ||
      sbom.metadata?.component?.['bom-ref'] !== rootRef ||
      sbom.metadata.component.name !== manifest.name ||
      sbom.metadata.component.version !== manifest.version ||
      sbom.metadata.component.purl !== `pkg:npm/${manifest.name}@${manifest.version}`) {
    fail('CycloneDX root component is not bound to borgmcp-shared@0.6.1.');
  }
  if (!Array.isArray(sbom.components) || !Array.isArray(sbom.dependencies)) {
    fail('CycloneDX components and dependencies must be arrays.');
  }

  const { graph: expectedGraph, pathByRef } = buildExpectedGraph(lock, rootRef);
  const componentRefs = new Set();
  for (const component of sbom.components) {
    const pathProperties = component.properties?.filter(
      (property) => property?.name === 'cdx:npm:package:path',
    ) ?? [];
    if (pathProperties.length > 1 ||
        (pathProperties.length === 1 && typeof pathProperties[0].value !== 'string')) {
      fail(`SBOM component has an invalid npm package path: ${component['bom-ref']}`);
    }
    const path = pathByRef.get(component['bom-ref']);
    if (path === undefined || path === '') {
      fail(`SBOM component is absent from package-lock.json: ${component['bom-ref']}`);
    }
    const locked = lock.packages[path];
    if (pathProperties.length === 1 && pathProperties[0].value !== path) {
      fail(`SBOM component path does not match package-lock.json: ${component['bom-ref']}`);
    }
    const name = packageNameFromLockPath(path);
    const expectedRef = `${name}@${locked.version}`;
    if (component['bom-ref'] !== expectedRef || component.name !== name ||
        component.version !== locked.version ||
        component.purl !== expectedPurl(name, locked.version)) {
      fail(`SBOM component identity does not match its lock entry: ${path}`);
    }
    if (componentRefs.has(expectedRef)) fail(`Duplicate SBOM component: ${expectedRef}`);
    componentRefs.add(expectedRef);

    const distributionReferences = component.externalReferences?.filter(
      (reference) => reference?.type === 'distribution',
    ) ?? [];
    if (distributionReferences.length !== 1 ||
        typeof distributionReferences[0].url !== 'string') {
      fail(`SBOM component must have exactly one distribution reference: ${expectedRef}`);
    }
    const distributionUrl = requireCanonicalTarballUrl(
      distributionReferences[0].url,
      name,
      locked.version,
      `SBOM distribution reference ${expectedRef}`,
    );
    if (distributionUrl !== locked.resolved) {
      fail(`SBOM distribution reference does not match package-lock.json: ${expectedRef}`);
    }

    const expectedHash = Buffer.from(locked.integrity.slice('sha512-'.length), 'base64')
      .toString('hex');
    const hashes = component.hashes ?? [];
    if (!hashes.some((hash) => hash?.alg === 'SHA-512' && hash.content === expectedHash)) {
      fail(`SBOM component SHA-512 does not match package-lock.json: ${expectedRef}`);
    }
  }

  const expectedComponents = new Set(expectedGraph.keys());
  expectedComponents.delete(rootRef);
  if (!sameStrings(componentRefs, expectedComponents)) {
    fail('CycloneDX components do not match the lock-derived release-target tree.');
  }

  const actualGraph = new Map();
  for (const dependency of sbom.dependencies) {
    if (typeof dependency?.ref !== 'string' || !Array.isArray(dependency.dependsOn) ||
        dependency.dependsOn.some((ref) => typeof ref !== 'string')) {
      fail('CycloneDX dependency graph contains an invalid entry.');
    }
    if (actualGraph.has(dependency.ref)) fail(`Duplicate SBOM dependency node: ${dependency.ref}`);
    actualGraph.set(dependency.ref, [...dependency.dependsOn].sort());
  }
  if (!sameStrings(actualGraph.keys(), expectedGraph.keys())) {
    fail('CycloneDX dependency nodes do not match the lock-derived release-target tree.');
  }
  for (const [ref, expectedDependencies] of expectedGraph) {
    if (!sameStrings(actualGraph.get(ref) ?? [], expectedDependencies)) {
      fail(`CycloneDX dependency edges do not match the lock-derived release-target tree: ${ref}`);
    }
  }

  return {
    name: manifest.name,
    version: manifest.version,
    format: `${sbom.bomFormat}-${sbom.specVersion}`,
    components: componentRefs.size,
    dependencyNodes: actualGraph.size,
    runtimeDependencies: 0,
    releaseTarget: RELEASE_TARGET,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyReleaseSbom(process.argv[2]), null, 2));
}
