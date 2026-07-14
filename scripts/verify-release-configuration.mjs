const API = 'https://api.github.com';
const REPOSITORY = 'Byte-Ventures/borg-mcp-shared';
const EXPECTED_TAG_REF = 'refs/tags/v*.*.*';
const EXPECTED_REVIEWER = { login: 'TheodorStorm', id: 12745431 };

if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required to verify release configuration.');

async function github(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GitHub configuration check ${path} returned HTTP ${response.status}.`);
  return response.json();
}

function sameValues(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

const repository = await github(`/repos/${REPOSITORY}`);
if (repository.private || repository.visibility !== 'public' || repository.default_branch !== 'main') {
  throw new Error('Release repository must be public with main as its default branch.');
}
for (const feature of [
  'secret_scanning',
  'secret_scanning_push_protection',
  'secret_scanning_validity_checks',
  'secret_scanning_non_provider_patterns',
  'dependabot_security_updates',
]) {
  if (repository.security_and_analysis?.[feature]?.status !== 'enabled') {
    throw new Error(`Public repository security control must be enabled: ${feature}`);
  }
}
const privateReporting = await github(`/repos/${REPOSITORY}/private-vulnerability-reporting`);
if (privateReporting.enabled !== true) throw new Error('Private vulnerability reporting must be enabled.');

const environment = await github(`/repos/${REPOSITORY}/environments/npm-publish`);
if (environment.can_admins_bypass !== false) throw new Error('npm-publish must disable administrator bypass.');
const reviewerRule = environment.protection_rules?.find((rule) => rule.type === 'required_reviewers');
if (!reviewerRule || reviewerRule.prevent_self_review !== false || reviewerRule.reviewers?.length !== 1) {
  throw new Error('npm-publish must use the ratified sole-operator approval shape.');
}
const reviewer = reviewerRule.reviewers[0];
if (reviewer.type !== 'User' || reviewer.reviewer?.login !== EXPECTED_REVIEWER.login ||
    reviewer.reviewer?.id !== EXPECTED_REVIEWER.id) {
  throw new Error('npm-publish reviewer is not the ratified sole operator.');
}

const policies = await github(
  `/repos/${REPOSITORY}/environments/npm-publish/deployment-branch-policies`,
);
if (policies.total_count !== 1 || policies.branch_policies?.[0]?.type !== 'tag' ||
    policies.branch_policies[0].name !== 'v*.*.*') {
  throw new Error('npm-publish deployment policy must be exactly the v*.*.* tag pattern.');
}

const variables = await github(`/repos/${REPOSITORY}/environments/npm-publish/variables`);
const variableMap = new Map(variables.variables?.map((variable) => [variable.name, variable.value]));
if (variableMap.get('NPM_EXPECTED_OWNER') !== 'byteventures') {
  throw new Error('NPM_EXPECTED_OWNER must equal byteventures.');
}
const registryResponse = await fetch('https://registry.npmjs.org/borgmcp-shared', { cache: 'no-store' });
const expectedBootstrap = registryResponse.status === 404 ? 'true' : 'false';
if (registryResponse.status !== 404 && !registryResponse.ok) {
  throw new Error(`npm package-state check returned HTTP ${registryResponse.status}.`);
}
if (variableMap.get('ALLOW_UNCLAIMED_FIRST_PUBLISH') !== expectedBootstrap) {
  throw new Error(`ALLOW_UNCLAIMED_FIRST_PUBLISH must equal ${expectedBootstrap}.`);
}

const rulesets = await github(`/repos/${REPOSITORY}/rulesets?includes_parents=true`);
const activeRulesets = [];
for (const ruleset of rulesets.filter((item) => item.enforcement === 'active')) {
  activeRulesets.push(await github(`/repos/${REPOSITORY}/rulesets/${ruleset.id}`));
}
const releaseRuleset = activeRulesets.find((ruleset) => ruleset.target === 'tag' && (
  sameValues(ruleset.conditions?.ref_name?.include ?? [], [EXPECTED_TAG_REF]) &&
  sameValues(ruleset.conditions?.ref_name?.exclude ?? [], [])
));
if (!releaseRuleset) throw new Error(`No active tag ruleset protects ${EXPECTED_TAG_REF}.`);
if (releaseRuleset.bypass_actors?.length !== 1 ||
    releaseRuleset.bypass_actors[0].actor_type !== 'User' ||
    releaseRuleset.bypass_actors[0].actor_id !== EXPECTED_REVIEWER.id ||
    releaseRuleset.bypass_actors[0].bypass_mode !== 'always') {
  throw new Error('Release-tag ruleset has a broader bypass than the ratified sole operator.');
}
const ruleMap = new Map(releaseRuleset.rules?.map((rule) => [rule.type, rule]));
const fetchAndMerge = ruleMap.get('update')?.parameters?.update_allows_fetch_and_merge;
if (!sameValues(ruleMap.keys(), ['creation', 'update', 'deletion', 'non_fast_forward']) ||
    (fetchAndMerge !== undefined && fetchAndMerge !== false)) {
  throw new Error('Release-tag ruleset does not enforce the exact creation/update/deletion/non-fast-forward policy.');
}

const mainRuleset = activeRulesets.find((ruleset) => ruleset.target === 'branch' && (
  sameValues(ruleset.conditions?.ref_name?.include ?? [], ['refs/heads/main']) &&
  sameValues(ruleset.conditions?.ref_name?.exclude ?? [], [])
));
if (!mainRuleset) throw new Error('No active branch ruleset protects refs/heads/main.');
if ((mainRuleset.bypass_actors ?? []).length !== 0) throw new Error('Main ruleset must not allow bypass actors.');
const mainRuleMap = new Map(mainRuleset.rules?.map((rule) => [rule.type, rule]));
if (!sameValues(mainRuleMap.keys(), ['pull_request', 'required_status_checks', 'deletion', 'non_fast_forward'])) {
  throw new Error('Main ruleset does not enforce the exact review/check/deletion/non-fast-forward policy.');
}
const review = mainRuleMap.get('pull_request')?.parameters;
if (review?.required_approving_review_count !== 0 ||
    review.dismiss_stale_reviews_on_push !== false ||
    review.require_code_owner_review !== false ||
    review.require_last_push_approval !== false ||
    review.required_review_thread_resolution !== true ||
    !sameValues(review.allowed_merge_methods ?? [], ['merge'])) {
  throw new Error('Main pull-request review policy differs from the approved configuration.');
}
const checks = mainRuleMap.get('required_status_checks')?.parameters;
const checkKeys = (checks?.required_status_checks ?? []).map(
  (check) => `${check.context}:${check.integration_id}`,
);
if (checks?.strict_required_status_checks_policy !== true ||
    checks.do_not_enforce_on_create !== false ||
    !sameValues(checkKeys, ['package (20):15368', 'package (22):15368'])) {
  throw new Error('Main required checks must be the two GitHub Actions package jobs.');
}
const actions = await github(`/repos/${REPOSITORY}/actions/permissions`);
if (!actions.enabled || actions.allowed_actions !== 'selected' || actions.sha_pinning_required !== true) {
  throw new Error('Actions must be enabled, selected-only, and require full-SHA pins.');
}
const selectedActions = await github(`/repos/${REPOSITORY}/actions/permissions/selected-actions`);
if (selectedActions.github_owned_allowed !== true || selectedActions.verified_allowed !== false ||
    !sameValues(selectedActions.patterns_allowed ?? [], [])) {
  throw new Error('Actions policy must allow only full-SHA-pinned GitHub-owned actions.');
}
const workflowPermissions = await github(`/repos/${REPOSITORY}/actions/permissions/workflow`);
if (workflowPermissions.default_workflow_permissions !== 'read' ||
    workflowPermissions.can_approve_pull_request_reviews !== false) {
  throw new Error('Workflow tokens must be read-only and unable to approve pull requests.');
}

console.log(JSON.stringify({
  repository: 'public',
  reporting: 'private-vulnerability-reporting-enabled',
  environment: 'sole-operator-protected',
  deploymentTag: 'v*.*.*',
  releaseTag: EXPECTED_TAG_REF,
  main: 'review-and-check-protected',
  actions: 'github-owned-sha-pinned',
  expectedOwner: 'byteventures',
  bootstrap: expectedBootstrap === 'true',
}, null, 2));
