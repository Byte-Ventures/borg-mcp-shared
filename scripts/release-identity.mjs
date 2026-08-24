import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'borgmcp-shared';
const PACKAGE_PATH = 'package.json';
const LOCK_PATH = 'package-lock.json';
const VERSION_PIN_PATHS = Object.freeze([
  'scripts/verify-packed-artifact.mjs',
  'src/protocol/contract.ts',
  'test/packed-artifact.test.ts',
  'test/protocol-contract.test.ts',
]);
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const sha = /^[0-9a-f]{40}$/u;

function fail(message) {
  throw new Error(message);
}

function git(root, args, raw = false) {
  const output = execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return raw ? output : output.trim();
}

function json(raw, description) {
  try {
    return JSON.parse(raw);
  } catch {
    fail(`${description} is not valid JSON.`);
  }
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function requireVersion(value, description) {
  if (typeof value !== 'string' || !stableVersion.test(value) ||
      value.split('.').some((part) => !Number.isSafeInteger(Number(part)))) {
    fail(`${description} must be a stable x.y.z version.`);
  }
  return value;
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function manifest(raw) {
  const value = json(raw, PACKAGE_PATH);
  if (value.name !== PACKAGE_NAME || typeof value.version !== 'string') {
    fail(`${PACKAGE_PATH} has invalid package identity.`);
  }
  return value;
}

function lockfile(raw, version) {
  const value = json(raw, LOCK_PATH);
  if (value.name !== PACKAGE_NAME || value.version !== version ||
      value.packages?.['']?.name !== PACKAGE_NAME ||
      value.packages?.['']?.version !== version) {
    fail(`${LOCK_PATH} root identity is invalid.`);
  }
  return value;
}

function transformVersion(raw, oldVersion, newVersion, path) {
  if (!raw.includes(oldVersion)) {
    fail(`Version carrier has no ${oldVersion} assertion: ${path}`);
  }
  const result = raw.replaceAll(oldVersion, newVersion);
  if (result.includes(oldVersion)) fail(`Version carrier was not fully moved: ${path}`);
  return result;
}

function requireReleaseNotes(root, ref, version) {
  const path = `docs/releases/${version}.md`;
  let notes;
  try {
    notes = git(root, ['show', `${ref}:${path}`], true);
  } catch {
    fail(`Release notes are missing: ${path}`);
  }
  if (!notes.trim()) fail(`Release notes are blank: ${path}`);
  return path;
}

async function readWorkingFiles(root) {
  const paths = [PACKAGE_PATH, LOCK_PATH, ...VERSION_PIN_PATHS];
  return new Map(await Promise.all(paths.map(async (path) => [
    path,
    await readFile(`${root}/${path}`, 'utf8'),
  ])));
}

export function buildReleaseTransform(files, oldVersion, newVersion) {
  requireVersion(oldVersion, 'Base version');
  requireVersion(newVersion, 'Target version');
  if (compareVersions(newVersion, oldVersion) <= 0) {
    fail(`Target version ${newVersion} must be newer than ${oldVersion}.`);
  }
  const baseManifest = manifest(files.get(PACKAGE_PATH));
  if (baseManifest.version !== oldVersion) fail('Base package version is invalid.');
  const baseLock = lockfile(files.get(LOCK_PATH), oldVersion);
  const transformed = new Map([
    [PACKAGE_PATH, canonical({ ...baseManifest, version: newVersion })],
    [LOCK_PATH, canonical({
      ...baseLock,
      version: newVersion,
      packages: {
        ...baseLock.packages,
        '': { ...baseLock.packages[''], version: newVersion },
      },
    })],
  ]);
  for (const path of VERSION_PIN_PATHS) {
    transformed.set(path, transformVersion(files.get(path), oldVersion, newVersion, path));
  }
  return transformed;
}

export async function prepareRelease(root, targetVersion) {
  if (git(root, ['status', '--porcelain']) !== '') {
    fail('release:prepare requires a clean working tree.');
  }
  requireVersion(targetVersion, 'Target version');
  requireReleaseNotes(root, 'HEAD', targetVersion);
  const files = await readWorkingFiles(root);
  const oldVersion = requireVersion(manifest(files.get(PACKAGE_PATH)).version, 'Base version');
  const transformed = buildReleaseTransform(files, oldVersion, targetVersion);
  await Promise.all([...transformed].map(([path, raw]) => writeFile(`${root}/${path}`, raw)));
  return Object.freeze({
    oldVersion,
    newVersion: targetVersion,
    paths: [...transformed.keys()].sort(),
  });
}

export function verifyReleaseIdentity(root, base, candidate) {
  if (!sha.test(base) || !sha.test(candidate)) {
    fail('Release identity refs must be exact 40-character commit SHAs.');
  }
  try {
    git(root, ['merge-base', '--is-ancestor', base, candidate]);
  } catch {
    fail('Release identity base must be an ancestor of the candidate.');
  }
  const readRef = (ref, path) => git(root, ['show', `${ref}:${path}`], true);
  const paths = [PACKAGE_PATH, LOCK_PATH, ...VERSION_PIN_PATHS];
  const baseFiles = new Map(paths.map((path) => [path, readRef(base, path)]));
  const candidateFiles = new Map(paths.map((path) => [path, readRef(candidate, path)]));
  const oldVersion = requireVersion(manifest(baseFiles.get(PACKAGE_PATH)).version, 'Base version');
  lockfile(baseFiles.get(LOCK_PATH), oldVersion);
  const newVersion = requireVersion(manifest(candidateFiles.get(PACKAGE_PATH)).version, 'Candidate version');
  lockfile(candidateFiles.get(LOCK_PATH), newVersion);
  const expected = buildReleaseTransform(baseFiles, oldVersion, newVersion);
  for (const [path, raw] of expected) {
    if (candidateFiles.get(path) !== raw) fail(`Release identity carrier is stale or changed unexpectedly: ${path}`);
  }
  const notesPath = requireReleaseNotes(root, candidate, newVersion);
  return Object.freeze({
    base,
    candidate,
    oldVersion,
    newVersion,
    paths: [...paths, notesPath].sort(),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === 'prepare') {
    if (args.length !== 1) fail('Usage: release-identity.mjs prepare <version>');
    console.log(JSON.stringify(await prepareRelease(process.cwd(), args[0]), null, 2));
  } else if (operation === 'verify') {
    if (args.length !== 2) fail('Usage: release-identity.mjs verify <base-sha> <candidate-sha>');
    console.log(JSON.stringify(verifyReleaseIdentity(process.cwd(), args[0], args[1]), null, 2));
  } else {
    fail('Usage: release-identity.mjs <prepare|verify> ...');
  }
}
