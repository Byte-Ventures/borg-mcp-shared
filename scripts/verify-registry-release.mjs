import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { verifyPackedArtifact } from './verify-packed-artifact.mjs';

const REGISTRY = 'https://registry.npmjs.org';
const PROPAGATION_ATTEMPTS = 18;
const PROPAGATION_MAX_DELAY_MS = 15_000;

async function request(path) {
  return fetch(`${REGISTRY}/${path}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
}

async function json(response, description) {
  if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}.`);
  return response.json();
}

export async function readWithPropagationRetry(
  read,
  description,
  {
    attempts = PROPAGATION_ATTEMPTS,
    maxDelayMs = PROPAGATION_MAX_DELAY_MS,
    wait = delay,
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await read();
    if (response.status !== 404) return response;
    if (attempt === attempts) {
      throw new Error(`${description} remained HTTP 404 after ${attempts} attempts.`);
    }
    await wait(Math.min(1_000 * (2 ** (attempt - 1)), maxDelayMs));
  }
  throw new Error(`${description} retry loop terminated unexpectedly.`);
}

function verifyOwner(packument, expectedOwner) {
  if (expectedOwner !== 'byteventures') {
    throw new Error('NPM_EXPECTED_OWNER must equal the verified owner byteventures.');
  }
  const maintainers = (packument.maintainers ?? []).map((maintainer) => maintainer.name).sort();
  if (maintainers.length !== 1 || maintainers[0] !== expectedOwner) {
    throw new Error(`Package is not owned by NPM_EXPECTED_OWNER; registry maintainers: ${maintainers.join(', ')}`);
  }
}

export async function prepublish(
  name,
  version,
  {
    expectedOwner = process.env.NPM_EXPECTED_OWNER,
    read = request,
  } = {},
) {
  const versionResponse = await read(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  if (versionResponse.status !== 404) {
    if (versionResponse.ok) throw new Error(`${name}@${version} already exists and is immutable.`);
    throw new Error(`Version availability check returned HTTP ${versionResponse.status}.`);
  }

  const packageResponse = await read(encodeURIComponent(name));
  const packument = await json(packageResponse, 'Package ownership check');
  verifyOwner(packument, expectedOwner);
  return { name, version, registryState: 'owned' };
}

export async function postpublish(
  name,
  version,
  integrity,
  {
    read = request,
    retry = {},
  } = {},
) {
  const versionResponse = await readWithPropagationRetry(
    () => read(`${encodeURIComponent(name)}/${encodeURIComponent(version)}`),
    'Published version verification',
    retry,
  );
  const published = await json(versionResponse, 'Published version verification');
  if (published.dist?.integrity !== integrity) {
    throw new Error(`Registry integrity mismatch: expected ${integrity}, received ${published.dist?.integrity}.`);
  }
  return { name, version, integrity, registryState: 'verified' };
}

function writeOutputs(artifact) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const key of ['name', 'version', 'integrity']) {
    const value = artifact[key];
    if (typeof value !== 'string' || value.includes('\n') || value.includes('\r')) {
      throw new Error(`Packed artifact ${key} is not safe for a workflow output.`);
    }
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  let report;
  if (mode === 'prepublish' && args.length === 1) {
    const artifact = await verifyPackedArtifact(args[0]);
    report = {
      ...await prepublish(artifact.name, artifact.version),
      integrity: artifact.integrity,
    };
    writeOutputs(artifact);
  } else if (mode === 'postpublish' && args.length === 3) {
    report = await postpublish(args[0], args[1], args[2]);
  } else {
    throw new Error(
      'Usage: node scripts/verify-registry-release.mjs prepublish <package.tgz> | postpublish <name> <version> <integrity>',
    );
  }
  console.log(JSON.stringify(report, null, 2));
}
