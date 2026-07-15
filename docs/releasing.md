# Publishing `borgmcp-shared`

This repository publishes immutable public releases from a protected GitHub
Actions environment. A release is built once, audited as a tarball, and then
published from that exact tarball. Local publication and publication from an
unreviewed branch are not supported.

The active release policy is governed by the ratified
`shared-package-consumption` and `npm-publish-sole-operator-approval` decisions.
This document describes the operator procedure; it does not authorize a release.

## Permanent Repository Configuration

Configure these controls before creating a release tag:

1. Keep `.github/workflows/publish.yml` as the only npm trusted-publisher
   workflow. The workflow uses a GitHub-hosted runner, exact Node and npm
   versions, no dependency cache, and only `contents: read` plus
   `id-token: write` in the protected publish job. npm is installed with
   lifecycle scripts disabled under an isolated `${RUNNER_TEMP}` prefix; only
   that prefix's bin directory enters `GITHUB_PATH`. Never update the active
   global npm installation from within npm itself.
2. Create a GitHub environment named `npm-publish`. Require an authorized
   approval from the sole operator `TheodorStorm`, allow self-review so that the
   sole-operator path remains executable, and prevent administrators from
   bypassing its protection rules. Store npm bootstrap credentials only in this
   environment. This exact shape is ratified by
   `npm-publish-sole-operator-approval`; adding any other reviewer or bypass
   actor requires a new decision.
3. Add an active tag ruleset whose only included ref is
   `refs/tags/v*.*.*`. Enable creation, update (without fetch-and-merge),
   deletion, and non-fast-forward restrictions. The sole bypass actor is the
   release-operator user `TheodorStorm` (GitHub user ID `12745431`), with no
   role, administrator, team, application, or deploy-key bypass. Require an
   annotated tag; the workflow rejects lightweight tags and tags whose commit is
   not on `main`.
4. Set the environment variable `NPM_EXPECTED_OWNER` to `byteventures`, the npm
   maintainer returned by `npm view borgmcp maintainers`. Do not infer this value
   from package metadata.
5. Keep the GitHub repository public when provenance is generated. npm cannot
   issue provenance for a public package built from a private GitHub repository,
   and the workflow stops if the repository is private.
6. Protect `refs/heads/main` with an active ruleset and no bypass actors. Require
   resolved review threads and the `package (20)` and `package (22)` checks from
   GitHub Actions application ID `15368`, with strict status checking. Set the
   GitHub approval count to zero and disable stale-review dismissal, code-owner
   review, and last-push approval: the separately recorded cube CR, Security,
   and Release Quality gates are the human evidence, while a GitHub approval
   requirement would be inoperable for the sole repository operator. Allow
   merge commits only and protect deletion and non-fast-forward operations. Do
   not add a restrictive update rule, which would block normal pull-request
   merges without a bypass.
7. Restrict Actions to selected GitHub-owned actions and require full commit-SHA
   pins. Do not allow all verified Marketplace publishers or any custom pattern.
   The CI and publish workflows need only `actions/checkout`,
   `actions/setup-node`, `actions/upload-artifact`, and
   `actions/download-artifact`, each pinned in source. Keep workflow tokens
   read-only and prohibit them from approving pull requests.
8. Enable GitHub private vulnerability reporting, secret scanning, push
   protection, and Dependabot security updates unconditionally. Enable secret
   validity checks and non-provider pattern detection whenever the organization
   plan licenses them. GitHub requires a paid plan with GitHub Secret Protection
   for [validity checks](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/enable-validity-checks)
   and [non-provider patterns](https://docs.github.com/en/code-security/secret-scanning/using-advanced-secret-scanning-and-push-protection-features/non-provider-patterns/enabling-secret-scanning-for-non-provider-patterns).
   The configuration guard accepts those two controls as disabled only while the
   live organization plan is exactly `free`; a plan change makes them mandatory.
   `SECURITY.md` directs reporters to the private reporting path, so disabled
   reporting is always a release-blocking documentation failure.

The environment approval is the final technical control. Approval must remain
pending while Security reviews the artifact produced by the `verify` job.
GitHub's ephemeral workflow token cannot read every repository-administration
setting checked by `scripts/verify-release-configuration.mjs`. An authorized
operator must run the guard with an administration-capable token before creating
the tag and again immediately before approving the environment:

```sh
GITHUB_TOKEN="$(gh auth token)" node scripts/verify-release-configuration.mjs
```

The token is read from the operator's credential store and must not be written
to the repository, an artifact, or workflow output. Any guard failure blocks the
tag or environment approval.

Every release and verification-only run must be a first attempt. The workflow
logs `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`, rejects any attempt other than `1`
before dependency installation, and includes the same values in the uploaded
`RUN_EVIDENCE` file. Never use the Actions rerun controls to advance a failed
immutable tag or proof run.

Both jobs reject a repository-root `.npmrc` before their first npm command. The
exact npm bootstrap uses isolated runner-temp prefix, user config, and cache
paths, forces `https://registry.npmjs.org`, disables scripts, and verifies both
the installed npm version and registry before adding its bin directory to
`GITHUB_PATH`.

## First-Publish Bootstrap

npm trusted publishing cannot be configured until the unscoped package exists.
The initial `v0.2.0` bootstrap run, `29353763609`, failed during verification
before producing an artifact or reaching publication. The failed `v0.2.0` tag is
immutable and MUST NOT be moved, reused, or rerun. The separately authorized
`v0.2.1` tag run, `29355823822`, also failed verification before dependency
installation or artifact creation because the checkout action replaced its local
annotated-tag ref with the peeled commit. The remote `v0.2.1` tag remains valid
and immutable and MUST NOT be moved, reused, or rerun.

The first protected-main verification-only proof run, `29356980492`, confirmed
the repaired tag/source trust checks, then failed before artifact upload because
npm 11 interpreted the bare `release/<tarball>` argument as a package/GitHub spec
instead of a local file. It produced no auditable artifact and MUST NOT be rerun.
The workflow now passes generated tarballs to both npm dry-run and publication as
explicit `./release/<tarball>` filesystem paths.

The next protected-main proof run, `29357632667`, passed every verification gate
against immutable `v0.2.1`, structurally skipped the publish job, and produced an
exact artifact that passed Security audit. This proved the corrected tag,
protected-main, input, artifact, and npm local-file handling without reusing the
tag for publication.

Under the ratified `borgmcp-shared-recovery-version` decision, `0.2.2` is the
selected recovery version. The source bump does not itself authorize a tag,
environment approval, or publication.

Run `29360398007` published `borgmcp-shared@0.2.2` from the exact approved
artifact, and the registry integrity and maintainer matched that artifact. The
workflow then failed during immediate postpublish verification when the package
ownership read returned HTTP 404 before registry propagation completed. The run
and `v0.2.2` tag are immutable and MUST NOT be rerun, moved, or reused. Consumer
migration was blocked until provenance and signatures were independently verified
and Security approved the recovery evidence.

Recover out of band without rerunning the workflow:

1. Download artifact `8321897865` from run `29360398007` and recheck its recorded
   ZIP digest, `RUN_EVIDENCE`, tarball SHA-512, and artifact verifier report.
2. With `GITHUB_SHA=508f2dc88658d8e00ff036b7ce6913fcfbef239b` and
   `NPM_EXPECTED_OWNER=byteventures`, run
   `node scripts/verify-registry-release.mjs postpublish <audited-tarball>`. The
   verifier retries only transient HTTP 404 propagation responses with bounded
   backoff; non-404 failures and integrity, owner, or provenance mismatches remain
   immediate terminal failures.
3. Install exact `borgmcp-shared@0.2.2` from the registry into a clean temporary
   prefix with scripts disabled and run `npm audit signatures` against that
   prefix.
4. Record the independent integrity, ownership, signed-provenance, and signature
   evidence for a fresh Security verdict before changing any consumer dependency.

That recovery completed successfully: the registry tarball is byte-identical to
the audited artifact, its sole maintainer is `byteventures`, the signed in-toto
SLSA provenance binds the protected workflow/tag/commit/run, and npm verified one
registry signature plus one publish attestation. Security approved the recovery
evidence. Complete the bootstrap credential and Trusted Publisher cleanup below
before migrating consumers.

The eventual first publication will use one temporary credential while still
generating provenance from GitHub Actions.

Before creating the tag, the release operator must verify all of the following:

- The npm account is the account that owns `borgmcp`, uses authentication-and-
  writes 2FA, and has tested, protected recovery methods.
- `borgmcp-shared` is still unclaimed. An `E404` is expected. Any package or
  ownership result that differs from the reviewed state is a stop condition.
- Code Review, load-bearing Security Review, and Release Quality approved the
  exact commit on `main`.
- The Queen explicitly authorized generating the final release artifact. This
  authorization does not by itself approve the later environment deployment.

Create a short-lived, least-privilege npm publish token under the verified owner
account. Store it as the `NPM_TOKEN` secret in the `npm-publish` environment;
never place it in repository variables, workflow files, shell history,
`package.json`, a committed `.npmrc`, or an issue. Set the protected environment
variable `ALLOW_UNCLAIMED_FIRST_PUBLISH` to `true` only for this bootstrap.

The `0.2.2` package, lockfile, runbook, and version assertions must pass fresh CR,
Security, and Release Quality gates and merge to protected `main` before the
Coordinator creates its matching annotated tag under
`borgmcp-shared-first-publish-autonomy`. The tag starts the workflow but does not
immediately publish. The unprivileged `verify` job performs the following gates
first:

- verifies the public repository, annotated tag, exact package version, and
  ancestry on `main`;
- installs the lockfile without lifecycle scripts and runs audit, type checks,
  all tests, a clean build, and the tracked-`dist` drift check;
- creates one tarball with lifecycle scripts disabled;
- enforces the explicit public file allowlist, legal files, dependency and
  lifecycle policy, size limits, and resolvable source maps;
- exercises npm's publish metadata in dry-run mode; and
- installs the exact tarball with scripts disabled in a clean consumer, verifies
  its production tree, and imports every reviewed public export; and
- uploads the tarball, verifier report, and SHA-512 checksum for seven days.

Security must download and audit that exact workflow artifact. After Security
approves the tarball, Release Quality confirms the operator procedure, and the
Queen explicitly authorizes the public flip, an authorized reviewer may approve
the waiting `npm-publish` environment deployment. The publish job downloads and
checksum-verifies the same artifact, repeats the artifact verifier, checks that
`0.2.2` is absent and the name is unclaimed as expected, and publishes only the
downloaded tarball with `--access public --provenance`.

Immediately after a successful first publish:

1. Confirm the workflow's registry-integrity, owner, and SLSA provenance checks
   passed before changing any consumer dependency.
2. Configure npm's trusted publisher for organization `Byte-Ventures`, repository
   `borg-mcp-shared`, workflow filename `publish.yml`, environment
   `npm-publish`, and the `npm publish` action.
3. Remove the `NPM_TOKEN` environment secret, revoke the bootstrap token at npm,
   and set `ALLOW_UNCLAIMED_FIRST_PUBLISH` to `false`.
4. Configure npm publishing access to require 2FA and disallow traditional
   tokens. Future releases authenticate through short-lived OIDC credentials.
5. Only then replace consumers' exact Git SHA dependencies with
   `borgmcp-shared@^0.2.0` and commit their registry lockfiles.

## Later Releases

### 0.3.0 Enrollment Contract

The ratified `borgmcp-shared-enrollment-version` decision selects `0.3.0` for
the breaking retry-safe enrollment and idempotent multi-cube contract. Updating
package metadata, lockfiles, assertions, compatibility documentation, and this
runbook does not authorize creating `v0.3.0` or publishing the package.

Before a separately authorized `v0.3.0` tag is created:

1. The exact `0.3.0` source commit must be merged to protected `main` after Code
   Review, Security, and Release Quality approve the package identity, public
   API, conformance behavior, generated output, and release documentation.
2. The package and root lockfile, `SHARED_PACKAGE_VERSION`, compatibility matrix,
   packed-artifact verifier, and version assertions must all identify `0.3.0`.
3. The protected workflow must build one exact tarball and pass its full source,
   test, audit, public-export, source-map, install/import, dry-run, lock-derived
   CycloneDX SBOM, integrity, and provenance gates. Security must approve that
   exact workflow artifact.
4. The `0.3.0` workflow must generate a CycloneDX SBOM, canonicalize npm's
   checkout-derived root display name to the already-verified manifest name,
   and validate every component's official-registry source, purl, and lock
   SHA-512 plus the exact installed dependency graph and zero package runtime
   dependencies. The tarball, SBOM, and SBOM validation report must be
   checksummed and uploaded together for Security audit.
5. The tag and publication each require their own explicit authorization. A
   source-version approval, merge, or successful verification run grants neither.

After registry publication and independent integrity/provenance verification,
the first borgmcp client and borgmcp-server releases may replace their temporary
development dependency with the reviewed registry range `^0.3.0`. They must not
ship a Git dependency or fall back to the incompatible `0.2.x` enrollment
response.

Later releases follow the same source gates, annotated protected tag, exact
tarball audit, Queen authorization, and environment approval. The registry
preflight requires the package to be owned by `NPM_EXPECTED_OWNER` and rejects
an existing target version. It also fails if
`ALLOW_UNCLAIMED_FIRST_PUBLISH` is not `false` or any `NPM_TOKEN` remains;
npm must exchange the workflow's OIDC identity through the configured trusted
publisher.

## Stop and Recovery Conditions

Stop without approving the environment when any of these conditions occurs:

- the repository is private, the tag is lightweight or unprotected, the tag
  does not exactly match `v<package version>`, or its commit is not on `main`;
- the approved commit, tag target, tarball checksum, or audit artifact differs;
- `GITHUB_RUN_ATTEMPT` is not `1`, or run/attempt evidence is missing;
- tests, audit, build, tracked output, artifact policy, legal metadata, or dry
  run fails;
- the npm name, expected owner, account 2FA, recovery methods, credential scope,
  trusted-publisher configuration, or environment protection cannot be verified;
- the target version already exists, npm returns anything other than the
  expected ownership/availability response, or npm/GitHub is degraded; or
- final CR, Security, Release Quality, exact-tarball Security approval, or Queen
  authorization is missing.

npm versions are immutable. Never retry by overwriting any published version,
moving a release tag, force-pushing a branch, or publishing from a local rebuild.
A failed verification before publication requires fixing the source and
beginning again with a new reviewed version/tag plan. If npm accepted the version
but integrity or provenance verification failed, block every consumer migration,
preserve the workflow logs and artifact, and escalate as a release incident. Do not unpublish,
deprecate, or publish a replacement version without a separately reviewed and
authorized recovery decision.
