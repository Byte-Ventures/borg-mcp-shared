import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'borgmcp-shared';
const REPOSITORY = 'Byte-Ventures/borg-mcp-shared';
const WORKFLOW_PATH = '.github/workflows/publish.yml';
const ALLOWLIST_PATH = 'scripts/release-identity-allowlist.json';
const RECORDS_PATH = 'docs/release-records.json';
const PACKAGE_PATH = 'package.json';
const LOCK_PATH = 'package-lock.json';
const ATTEMPT = 1;
export const FAILED_RELEASE_STAGING_STEP = 'Stage exact verified tarball with Trusted Publishing provenance';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const registryVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const sha = /^[0-9a-f]{40}$/u;
const sri = /^sha512-[A-Za-z0-9+/]{86}==$/u;

function fail(message) {
  throw new Error(message);
}

function command(name, args, options = {}) {
  const output = execFileSync(name, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
    stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  return options.raw ? output : output.trim();
}

function git(root, args, options = {}) {
  return command('git', args, { cwd: root, raw: args[0] === 'show', ...options });
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

function requireAttempt(value, description) {
  if (value !== ATTEMPT) {
    fail(`${description} must be exactly workflow attempt 1; release workflow reruns are not release authority.`);
  }
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function decodeRecord(record) {
  const canonicalKeys = [
    'outcome', 'version', 'tag', 'tag_object', 'commit', 'tree',
    'workflow_run_id', 'workflow_run_attempt', 'workflow_conclusion',
    'verify_job_id', 'publish_job_id', 'artifact_integrity',
  ];
  const reconstructedKeys = [...canonicalKeys, 'reconstructed'];
  const keys = JSON.stringify(Object.keys(record ?? {}));
  const canonical = keys === JSON.stringify(canonicalKeys);
  const reconstructed = keys === JSON.stringify(reconstructedKeys) && record?.reconstructed === true;
  if (record === null || typeof record !== 'object' || Array.isArray(record) ||
      (!canonical && !reconstructed)) {
    fail('Release record has an invalid or non-canonical shape.');
  }
  const published = record.outcome === 'published' &&
    record.workflow_conclusion === 'success' && record.verify_job_id === null &&
    record.publish_job_id === null && typeof record.artifact_integrity === 'string' &&
    sri.test(record.artifact_integrity);
  const failed = record.outcome === 'failed-superseded' &&
    record.workflow_conclusion === 'failure' && Number.isSafeInteger(record.verify_job_id) &&
    record.verify_job_id > 0 && Number.isSafeInteger(record.publish_job_id) &&
    record.publish_job_id > 0 && record.artifact_integrity === null;
  if ((!published && !failed) || !stableVersion.test(record.version) ||
      record.tag !== `v${record.version}` || !sha.test(record.tag_object) ||
      !sha.test(record.commit) || !sha.test(record.tree) ||
      !Number.isSafeInteger(record.workflow_run_id) || record.workflow_run_id <= 0 ||
      !Number.isSafeInteger(record.workflow_run_attempt)) {
    fail('Release record has an invalid or non-canonical shape.');
  }
  requireAttempt(record.workflow_run_attempt, 'Release record workflow run attempt');
  return Object.freeze(record);
}

function decodeRecords(raw) {
  const records = json(raw, RECORDS_PATH);
  if (!Array.isArray(records)) fail(`${RECORDS_PATH} must be an array.`);
  records.forEach(decodeRecord);
  return records;
}

export function deriveGitProvenance(root, version) {
  requireVersion(version, 'Released version');
  const tag = `v${version}`;
  const ref = `refs/tags/${tag}`;
  let type;
  try {
    type = git(root, ['cat-file', '-t', ref]);
  } catch {
    fail(`Annotated release tag is missing: ${tag}`);
  }
  if (type !== 'tag') fail(`Release tag is not annotated: ${tag}`);
  return Object.freeze({
    version,
    tag,
    tag_object: git(root, ['rev-parse', `${ref}^{tag}`]),
    commit: git(root, ['rev-parse', `${ref}^{commit}`]),
    tree: git(root, ['rev-parse', `${ref}^{commit}^{tree}`]),
  });
}

export const systemAuthorities = Object.freeze({
  githubRun(root, runId, attempt) {
    return json(command('gh', [
      'api', `repos/${REPOSITORY}/actions/runs/${runId}/attempts/${attempt}`,
    ], { cwd: root }), 'GitHub Actions run');
  },
  githubRunJobs(root, runId, attempt) {
    return json(command('gh', [
      'api', `repos/${REPOSITORY}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
    ], { cwd: root }), 'GitHub Actions jobs');
  },
  artifactIntegrity(root, version) {
    return json(command('npm', [
      'view', `${PACKAGE_NAME}@${version}`, 'dist.integrity', '--json',
      '--registry=https://registry.npmjs.org',
    ], { cwd: root }), 'npm artifact integrity');
  },
  publishedVersions(root) {
    return json(command('npm', [
      'view', PACKAGE_NAME, 'versions', '--json', '--registry=https://registry.npmjs.org',
    ], { cwd: root }), 'npm published versions');
  },
});

function decodePublishedVersions(value) {
  const versions = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(versions) || versions.some((version) =>
    typeof version !== 'string' || !registryVersion.test(version)) ||
    new Set(versions).size !== versions.length) {
    fail('npm published-version authority returned an invalid response.');
  }
  return versions;
}

function failedPhaseEvidence(root, record, authorities) {
  requireAttempt(record.workflow_run_attempt, 'Failed-superseded workflow run attempt');
  const response = authorities.githubRunJobs(root, record.workflow_run_id, record.workflow_run_attempt);
  if (!response || !Array.isArray(response.jobs)) fail('Failed-superseded job authority returned an invalid response.');
  const jobs = response.jobs.filter((job) => job?.name === 'publish');
  if (jobs.length !== 1) fail('Failed-superseded release requires exactly one publish job.');
  const [job] = jobs;
  if (!Number.isSafeInteger(job.id) || job.id <= 0 || job.run_id !== record.workflow_run_id ||
      job.run_attempt !== ATTEMPT || job.head_sha !== record.commit || job.status !== 'completed' ||
      job.conclusion !== 'failure' || !Array.isArray(job.steps)) {
    fail('Failed-superseded release does not match authoritative pre-publication job evidence.');
  }
  const skipped = [
    'Build exact release tarball',
    'Reject existing version and wrong owner',
    'Exercise exact tarball in a clean consumer',
    FAILED_RELEASE_STAGING_STEP,
  ];
  for (const name of skipped) {
    const matches = job.steps.filter((step) => step?.name === name);
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'skipped') {
      fail(`Failed-superseded release step was not skipped: ${name}`);
    }
  }
  return Object.freeze({ verifyJobId: job.id, publishJobId: job.id });
}

export function verifyReleaseProvenance(root, input, authorities = systemAuthorities) {
  const record = decodeRecord(input);
  const provenance = deriveGitProvenance(root, record.version);
  for (const field of ['tag', 'tag_object', 'commit', 'tree']) {
    if (record[field] !== provenance[field]) fail(`Release record ${field} does not match the annotated tag authority.`);
  }
  const run = authorities.githubRun(root, record.workflow_run_id, record.workflow_run_attempt);
  if (run.id !== record.workflow_run_id || run.run_attempt !== ATTEMPT || run.head_sha !== record.commit ||
      run.head_branch !== record.tag || run.event !== 'push' || run.status !== 'completed' ||
      run.conclusion !== record.workflow_conclusion || run.path !== WORKFLOW_PATH) {
    fail('Release record does not match the tag workflow authority.');
  }
  if (record.outcome === 'failed-superseded') {
    failedPhaseEvidence(root, record, authorities);
    if (decodePublishedVersions(authorities.publishedVersions(root)).includes(record.version)) {
      fail('Failed-superseded release version exists in the npm registry.');
    }
  } else if (authorities.artifactIntegrity(root, record.version) !== record.artifact_integrity) {
    fail('Release record integrity does not match the npm artifact authority.');
  }
  return record;
}

export function createReleaseRecord(root, input, authorities = systemAuthorities) {
  requireAttempt(input.workflowRunAttempt, 'Workflow run attempt');
  const provenance = deriveGitProvenance(root, input.version);
  const conclusion = input.workflowConclusion ?? 'success';
  if (conclusion !== 'success' && conclusion !== 'failure') fail('Workflow conclusion must be success or failure.');
  const base = {
    ...provenance,
    workflow_run_id: input.workflowRunId,
    workflow_run_attempt: input.workflowRunAttempt,
    workflow_conclusion: conclusion,
  };
  const jobs = conclusion === 'failure'
    ? failedPhaseEvidence(root, base, authorities)
    : { verifyJobId: null, publishJobId: null };
  return verifyReleaseProvenance(root, {
    outcome: conclusion === 'failure' ? 'failed-superseded' : 'published',
    ...base,
    verify_job_id: jobs.verifyJobId,
    publish_job_id: jobs.publishJobId,
    artifact_integrity: input.artifactIntegrity ?? null,
  }, authorities);
}

function readFiles(root, paths) {
  return Promise.all(paths.map(async (path) => [path, await readFile(`${root}/${path}`, 'utf8')]));
}

async function workingFiles(root) {
  const allowlist = json(await readFile(`${root}/${ALLOWLIST_PATH}`, 'utf8'), ALLOWLIST_PATH);
  if (!Array.isArray(allowlist.versionPins) || allowlist.versionPins.some((path) => typeof path !== 'string')) {
    fail(`${ALLOWLIST_PATH} must contain versionPins.`);
  }
  const paths = [ALLOWLIST_PATH, PACKAGE_PATH, LOCK_PATH, RECORDS_PATH, ...allowlist.versionPins];
  return new Map(await readFiles(root, [...new Set(paths)]));
}

function manifest(files) {
  const value = json(files.get(PACKAGE_PATH), PACKAGE_PATH);
  if (value.name !== PACKAGE_NAME || typeof value.version !== 'string') fail(`${PACKAGE_PATH} has invalid package identity.`);
  return value;
}

function transformVersion(raw, oldVersion, newVersion, path) {
  const count = raw.split(oldVersion).length - 1;
  if (count === 0) fail(`Version-pin allowlist entry has no ${oldVersion} assertion: ${path}`);
  const result = raw.replaceAll(oldVersion, newVersion);
  if (result.includes(oldVersion)) fail(`Version-pin assertion was not fully moved: ${path}`);
  return result;
}

export function buildReleaseTransform(files, oldVersion, newVersion, record) {
  requireVersion(oldVersion, 'Base version');
  requireVersion(newVersion, 'Target version');
  if (compareVersions(newVersion, oldVersion) <= 0) fail(`Target version ${newVersion} must be newer than ${oldVersion}.`);
  const baseManifest = manifest(files);
  if (baseManifest.version !== oldVersion) fail('Base package version does not match the release record.');
  const lock = json(files.get(LOCK_PATH), LOCK_PATH);
  if (lock.name !== PACKAGE_NAME || lock.version !== oldVersion || lock.packages?.['']?.version !== oldVersion) {
    fail(`${LOCK_PATH} root identity is invalid.`);
  }
  const records = decodeRecords(files.get(RECORDS_PATH));
  if (records.some((existing) => existing.version === oldVersion)) fail(`Release record already exists for ${oldVersion}.`);
  const allowlist = json(files.get(ALLOWLIST_PATH), ALLOWLIST_PATH);
  const transformed = new Map();
  transformed.set(PACKAGE_PATH, canonical({ ...baseManifest, version: newVersion }));
  transformed.set(LOCK_PATH, canonical({ ...lock, version: newVersion, packages: { ...lock.packages, '': { ...lock.packages[''], version: newVersion } } }));
  for (const path of allowlist.versionPins) transformed.set(path, transformVersion(files.get(path), oldVersion, newVersion, path));
  transformed.set(RECORDS_PATH, canonical([...records, record]));
  return transformed;
}

function publishedAnchor(root, files, version, authorities) {
  const records = decodeRecords(files.get(RECORDS_PATH))
    .filter((record) => record.outcome === 'published' && compareVersions(record.version, version) < 0)
    .sort((left, right) => compareVersions(right.version, left.version));
  if (records.length === 0) fail('Failed-superseded release requires an earlier published provenance anchor.');
  return verifyReleaseProvenance(root, records[0], authorities);
}

function requirePreviousPublishedRecord(root, files, version, authorities) {
  const previous = decodePublishedVersions(authorities.publishedVersions(root))
    .filter((candidate) => stableVersion.test(candidate) && compareVersions(candidate, version) < 0)
    .sort(compareVersions)
    .at(-1);
  if (previous === undefined) return;
  const recorded = decodeRecords(files.get(RECORDS_PATH))
    .some((candidate) => candidate.version === previous && candidate.outcome === 'published');
  if (!recorded) fail(`Immediately previous published version is missing from release records: ${previous}`);
}

export async function prepareRelease(root, targetVersion, evidence, authorities = systemAuthorities) {
  if (git(root, ['status', '--porcelain']) !== '') fail('release:prepare requires a clean working tree.');
  const files = await workingFiles(root);
  const oldVersion = manifest(files).version;
  requirePreviousPublishedRecord(root, files, oldVersion, authorities);
  const record = createReleaseRecord(root, {
    version: oldVersion,
    workflowRunId: evidence.workflowRunId,
    workflowRunAttempt: evidence.workflowRunAttempt,
    workflowConclusion: evidence.workflowConclusion,
    artifactIntegrity: evidence.artifactIntegrity,
  }, authorities);
  const anchor = record.outcome === 'published' ? record : publishedAnchor(root, files, oldVersion, authorities);
  for (const candidate of [record, anchor]) {
    try {
      git(root, ['merge-base', '--is-ancestor', candidate.commit, 'HEAD']);
    } catch {
      fail('Release provenance commit is not an ancestor of the preparation base.');
    }
  }
  const transformed = buildReleaseTransform(files, oldVersion, targetVersion, record);
  await Promise.all([...transformed].map(([path, raw]) => writeFile(`${root}/${path}`, raw)));
  return Object.freeze({ oldVersion, newVersion: targetVersion, record, provenanceAnchor: anchor, paths: [...transformed.keys()].sort() });
}

export function verifyReleaseIdentity(root, base, candidate, authorities = systemAuthorities) {
  if (!sha.test(base) || !sha.test(candidate)) fail('Release identity refs must be exact 40-character commit SHAs.');
  try {
    git(root, ['merge-base', '--is-ancestor', base, candidate]);
  } catch {
    fail('Release identity base must be an ancestor of the candidate.');
  }
  const allowlistRaw = git(root, ['show', `${base}:${ALLOWLIST_PATH}`]);
  const allowlist = json(allowlistRaw, ALLOWLIST_PATH);
  const paths = [ALLOWLIST_PATH, PACKAGE_PATH, LOCK_PATH, RECORDS_PATH, ...allowlist.versionPins];
  const readRef = (ref, path) => git(root, ['show', `${ref}:${path}`]);
  const baseFiles = new Map(paths.map((path) => [path, readRef(base, path)]));
  const candidateFiles = new Map(paths.map((path) => [path, readRef(candidate, path)]));
  const oldVersion = manifest(baseFiles).version;
  requirePreviousPublishedRecord(root, candidateFiles, oldVersion, authorities);
  const records = decodeRecords(candidateFiles.get(RECORDS_PATH));
  const record = records.at(-1);
  if (!record || record.version !== oldVersion) fail(`Candidate has no generated release record for ${oldVersion}.`);
  const verified = verifyReleaseProvenance(root, record, authorities);
  const anchor = verified.outcome === 'published' ? verified : publishedAnchor(root, candidateFiles, oldVersion, authorities);
  for (const provenance of [verified, anchor]) {
    try {
      git(root, ['merge-base', '--is-ancestor', provenance.commit, base]);
    } catch {
      fail('Release provenance commit is not an ancestor of the release identity base.');
    }
  }
  const newVersion = manifest(candidateFiles).version;
  const expected = buildReleaseTransform(baseFiles, oldVersion, newVersion, verified);
  for (const [path, raw] of expected) if (candidateFiles.get(path) !== raw) fail(`Release identity shape mismatch: ${path}`);
  const changed = git(root, ['diff', '--name-only', base, candidate]).split('\n').filter(Boolean).sort();
  const expectedPaths = [...expected.keys()].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expectedPaths)) fail('Release identity changed files outside the generated allowlist.');
  return Object.freeze({ base, candidate, oldVersion, newVersion, paths: expectedPaths });
}

function parsePrepare(args) {
  const [version, ...flags] = args;
  if (!version || flags.length % 2 !== 0) fail('Usage: release:prepare <version> --workflow-run-id <id> --workflow-run-attempt <n> [--workflow-conclusion <success|failure>] [--artifact-integrity <sha512-SRI>]');
  const values = new Map();
  for (let index = 0; index < flags.length; index += 2) {
    if (!['--workflow-run-id', '--workflow-run-attempt', '--workflow-conclusion', '--artifact-integrity'].includes(flags[index]) || values.has(flags[index])) fail(`Invalid release:prepare flag: ${flags[index]}`);
    values.set(flags[index], flags[index + 1]);
  }
  const workflowRunId = Number(values.get('--workflow-run-id'));
  const workflowRunAttempt = Number(values.get('--workflow-run-attempt'));
  if (!Number.isSafeInteger(workflowRunId) || workflowRunId <= 0 || !Number.isSafeInteger(workflowRunAttempt)) fail('release:prepare requires a positive run id and attempt.');
  requireAttempt(workflowRunAttempt, 'release:prepare workflow run attempt');
  const workflowConclusion = values.get('--workflow-conclusion') ?? 'success';
  const artifactIntegrity = values.get('--artifact-integrity');
  if (workflowConclusion === 'failure' && artifactIntegrity !== undefined) fail('A failed-superseded release forbids artifact integrity.');
  if (workflowConclusion === 'success' && (!artifactIntegrity || !sri.test(artifactIntegrity))) fail('A successful release requires a canonical SHA-512 SRI.');
  return { version, evidence: { workflowRunId, workflowRunAttempt, workflowConclusion, ...(artifactIntegrity === undefined ? {} : { artifactIntegrity }) } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...args] = process.argv.slice(2);
  if (operation === 'prepare') {
    const parsed = parsePrepare(args);
    console.log(JSON.stringify(await prepareRelease(process.cwd(), parsed.version, parsed.evidence), null, 2));
  } else if (operation === 'verify') {
    if (args.length !== 2) fail('Usage: release-identity.mjs verify <base-sha> <candidate-sha>');
    console.log(JSON.stringify(verifyReleaseIdentity(process.cwd(), args[0], args[1]), null, 2));
  } else {
    fail('Usage: release-identity.mjs <prepare|verify> ...');
  }
}
