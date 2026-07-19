/**
 * Pure validation functions for the SR artifact-tuple approval gate.
 *
 * This module contains NO GitHub API calls, NO filesystem I/O, and NO
 * `core` usage — it is fully deterministic and testable. The workflow
 * step calls these functions with data fetched from GitHub API and
 * extracted from the artifact zip, then uses `core.setFailed()` for
 * any returned error.
 */

/**
 * @param {string} value
 * @param {number} [max=120]
 * @returns {string|null} error message or null if valid
 */
export function validateSha512(value, max = 120) {
  if (!value) return 'empty';
  if (typeof value !== 'string') return 'not a string';
  if (value.length !== 128) return `length ${value.length}, expected 128`;
  if (!/^[0-9a-f]+$/.test(value)) return 'contains non-hex characters';
  return null;
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {string|null} error message or null if valid
 */
export function validatePositiveInt(name, value) {
  if (!value) return `${name} is empty`;
  if (typeof value !== 'string') return `${name} is not a string`;
  if (!/^[1-9]\d*$/.test(value)) return `${name} '${value}' is not a positive integer`;
  return null;
}

/**
 * @param {object} run - GitHub workflow run object
 * @param {string} expectedPath
 * @param {string} expectedEvent
 * @param {string} expectedTag
 * @param {string} expectedSha
 * @param {number} expectedAttempt
 * @returns {string|null} error message or null if valid
 */
export function validateSourceRun(run, expectedPath, expectedEvent, expectedTag, expectedSha, expectedAttempt) {
  if (run.path !== expectedPath) return `workflow path '${run.path}' is not '${expectedPath}'`;
  if (run.event !== expectedEvent) return `event '${run.event}' is not '${expectedEvent}'`;
  if (run.head_branch !== expectedTag) return `head_branch '${run.head_branch}' is not '${expectedTag}'`;
  if (run.head_sha !== expectedSha) return `head_sha '${run.head_sha}' does not match release commit '${expectedSha}'`;
  if (run.conclusion !== 'success') return `conclusion is '${run.conclusion}', expected 'success'`;
  if (run.run_attempt !== expectedAttempt) return `run_attempt is ${run.run_attempt}, expected ${expectedAttempt}`;
  return null;
}

/**
 * @param {string[]} artifactFiles - list of file names in the artifact
 * @param {string} expectedTarball
 * @returns {string|null} error message or null if valid
 */
export function validateArtifactContents(artifactFiles, expectedTarball) {
  if (!artifactFiles.includes(expectedTarball)) return `tarball '${expectedTarball}' not found in artifact`;
  const allowed = new Set([
    'SHA512SUMS', 'RUN_EVIDENCE', 'artifact-report.json',
    `${expectedTarball.replace('.tgz', '')}.cdx.json`, 'sbom-report.json',
    expectedTarball,
  ]);
  const unexpected = artifactFiles.filter(f => !allowed.has(f));
  if (unexpected.length > 0) return `unexpected entries: ${unexpected.join(', ')}`;
  return null;
}

/**
 * @param {string} actualSha512
 * @param {string} expectedSha512
 * @returns {string|null} error message or null if valid
 */
export function validateTarballHash(actualSha512, expectedSha512) {
  if (actualSha512 !== expectedSha512) return `SHA-512 mismatch: expected ${expectedSha512}, got ${actualSha512}`;
  return null;
}

/**
 * @param {string} evidence - raw RUN_EVIDENCE file content
 * @param {string} expectedRunId
 * @param {string} expectedAttempt
 * @returns {string|null} error message or null if valid
 */
export function validateRunEvidence(evidence, expectedRunId, expectedAttempt) {
  if (!evidence) return 'RUN_EVIDENCE missing';
  const runId = evidence.match(/^run_id=(.+)$/m)?.[1];
  const attempt = evidence.match(/^run_attempt=(.+)$/m)?.[1];
  if (!runId) return 'run_id not found in RUN_EVIDENCE';
  if (runId !== expectedRunId) return `RUN_EVIDENCE run_id '${runId}' does not match '${expectedRunId}'`;
  if (!attempt) return 'run_attempt not found in RUN_EVIDENCE';
  if (attempt !== expectedAttempt) return `RUN_EVIDENCE run_attempt '${attempt}' does not match '${expectedAttempt}'`;
  return null;
}
