import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { postpublish } from './verify-registry-release.mjs';

const REPOSITORY = 'Byte-Ventures/borg-mcp-shared';
const PACKAGE_NAME = 'borgmcp-shared';
const WORKFLOW_PATH = '.github/workflows/publish.yml';
const API = 'https://api.github.com';
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const INTEGRITY_RE = /^sha512-([A-Za-z0-9+/]{86}==)$/u;

function fail(message) {
  throw new Error(message);
}

function command(name, args, root) {
  return execFileSync(name, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function git(root, args) {
  return command('git', args, root);
}

function parseJson(value, description) {
  try {
    return JSON.parse(value);
  } catch {
    fail(`${description} returned invalid JSON.`);
  }
}

export function assertReleasePullRequest(pullRequests, version, commit, mergeSubject) {
  if (!Array.isArray(pullRequests) || pullRequests.length !== 1) {
    fail('The tagged commit must resolve to exactly one pull request.');
  }
  const pullRequest = pullRequests[0];
  if (pullRequest?.state !== 'closed' || typeof pullRequest.merged_at !== 'string') {
    fail('The release pull request must be closed and merged.');
  }
  if (pullRequest.base?.ref !== 'main') fail('The release pull request must base main.');
  if (pullRequest.head?.ref !== `release/${version}`) {
    fail(`The release pull request must have head release/${version}.`);
  }
  if (pullRequest.merge_commit_sha !== commit) {
    fail('The release pull request merge commit must equal the tagged commit.');
  }
  if (typeof pullRequest.number !== 'number' ||
      !mergeSubject.match(new RegExp(`^Merge pull request #${pullRequest.number}(?:\\s|$)`, 'u'))) {
    fail('The local merge subject must agree with the release pull request number.');
  }
  if (typeof pullRequest.html_url !== 'string' || typeof pullRequest.body !== 'string') {
    fail('The release pull request must provide its URL and merged body.');
  }
  return pullRequest;
}

export function assembleReleaseBody({ packageName, version, integrity, tag, commit, pullRequest }) {
  return [
    '## Package',
    '',
    `- Registry: https://www.npmjs.com/package/${packageName}/v/${version}`,
    `- Live integrity: \`${integrity}\``,
    '- Published through npm Trusted Publishing with provenance.',
    '',
    '## Source',
    '',
    `- Tag: https://github.com/${REPOSITORY}/releases/tag/${tag}`,
    `- Commit: https://github.com/${REPOSITORY}/commit/${commit}`,
    `- Pull request: ${pullRequest.html_url}`,
    '',
    '## Release PR body (as merged)',
    '',
    pullRequest.body,
  ].join('\n');
}

const systemAuthorities = Object.freeze({
  git,
  githubApi(root, endpoint) {
    return parseJson(command('gh', ['api', endpoint], root), 'GitHub API');
  },
  postpublish,
  request(url, options) {
    return fetch(url, options);
  },
});

export async function createGithubRelease(version, integrity, {
  root = process.cwd(),
  token = process.env.GITHUB_TOKEN,
  authorities = systemAuthorities,
} = {}) {
  if (!VERSION_RE.test(version ?? '')) fail('Released version must be a stable X.Y.Z version.');
  if (!INTEGRITY_RE.test(integrity ?? '')) {
    fail('A canonical sha512 integrity from the verified stage download is required.');
  }
  if (!token) fail('GITHUB_TOKEN is required to create a GitHub Release.');
  const tag = `v${version}`;
  const ref = `refs/tags/${tag}`;
  if (authorities.git(root, ['cat-file', '-t', ref]) !== 'tag') {
    fail(`Release tag is not annotated: ${tag}`);
  }
  const commit = authorities.git(root, ['rev-parse', `${ref}^{commit}`]);
  const tagMessage = authorities.git(root, ['for-each-ref', '--format=%(contents)', ref]);
  if (!tagMessage) fail(`Annotated release tag has no message: ${tag}`);
  const mergeSubject = authorities.git(root, ['show', '-s', '--format=%s', commit]);

  const pullRequests = authorities.githubApi(root, `repos/${REPOSITORY}/commits/${commit}/pulls`);
  const pullRequest = assertReleasePullRequest(pullRequests, version, commit, mergeSubject);
  const runs = authorities.githubApi(
    root,
    `repos/${REPOSITORY}/actions/runs?head_sha=${commit}&event=push&status=success&per_page=100`,
  )?.workflow_runs;
  const releaseRuns = Array.isArray(runs) ? runs.filter((run) =>
    run.path === WORKFLOW_PATH && run.head_sha === commit && run.head_branch === tag &&
    run.run_attempt === 1 && run.status === 'completed' && run.conclusion === 'success') : [];
  if (releaseRuns.length !== 1) fail('The tag must have exactly one successful attempt-1 release workflow run.');

  const published = await authorities.postpublish(PACKAGE_NAME, version, integrity);
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': '2022-11-28',
  };
  const releaseUrl = `${API}/repos/${REPOSITORY}/releases/tags/${tag}`;
  const existing = await authorities.request(releaseUrl, { headers, cache: 'no-store' });
  if (existing.status !== 404) {
    if (existing.ok) fail(`GitHub Release already exists for ${tag}.`);
    fail(`GitHub Release existence check returned HTTP ${existing.status}.`);
  }
  const body = assembleReleaseBody({
    packageName: published.name,
    version,
    integrity: published.integrity,
    tag,
    commit,
    pullRequest,
  });
  const created = await authorities.request(`${API}/repos/${REPOSITORY}/releases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tag_name: tag, name: tagMessage, make_latest: 'true', body }),
  });
  if (!created.ok) fail(`GitHub Release creation returned HTTP ${created.status}.`);
  return created.json();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [version, flag, integrity, ...extra] = process.argv.slice(2);
  if (!version || flag !== '--integrity' || !integrity || extra.length > 0) {
    fail('Usage: node scripts/create-github-release.mjs <version> --integrity <sha512-SRI>');
  }
  console.log(JSON.stringify(await createGithubRelease(version, integrity), null, 2));
}
