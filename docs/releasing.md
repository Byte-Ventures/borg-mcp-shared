# Publishing `borgmcp-shared`

This repository publishes immutable public releases through one protected workflow job
in GitHub Actions. The active `minimal-package-release-assurance` decision replaces the
former cross-run artifact approval protocol. This runbook describes the current
operator procedure; it does not authorize a tag or publication.

## Assurance Boundary

The release lane has one build, test, package, and publication authority:
`.github/workflows/publish.yml` on an annotated `v*.*.*` tag. The job:

1. verifies the public repository context, exact package version, annotated tag,
   tag commit, and ancestry on protected `main`;
2. installs locked dependencies without lifecycle scripts and runs dependency
   audit, type checks, the full test suite, one clean build, and generated-output
   drift detection;
3. creates one local tarball, enforces the packed-artifact policy, and installs
   that tarball into a clean consumer that imports every public export;
4. rejects an existing immutable version or a package not owned solely by the
   configured npm owner before any registry mutation;
5. publishes that exact local tarball through npm Trusted Publishing with
   provenance. Successful completion of `npm publish` is the workflow's terminal
   release boundary; no post-publication registry readback can fail the immutable
   release after npm has accepted it.

npm and GitHub produce the registry signature and publish attestation as part of
Trusted Publishing. The repository does not reconstruct or immediately read back
those records, reconstruct DSSE or SLSA statements, transfer approval tuples
between runs, rebuild in a second job, or place checksum, SBOM, and report bundles
on the critical publication path. SBOM portability remains covered by CI and the
repository's dedicated deterministic SBOM tests.

## Permanent Configuration

Keep these controls in place:

1. `publish.yml` is the only npm Trusted Publisher workflow for organization
   `Byte-Ventures`, repository `borg-mcp-shared`, and environment `npm-publish`.
2. The `npm-publish` environment requires the authorized sole operator
   `TheodorStorm`, permits that operator's self-review, prevents administrator
   bypass, and allows only protected `v*.*.*` tags.
3. `NPM_EXPECTED_OWNER` is `byteventures`. It comes from the live npm package
   maintainer record, not package metadata.
4. No `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or committed `.npmrc` participates in an
   owned-package release. Authentication is the job's short-lived OIDC exchange.
5. The publish job uses a GitHub-hosted runner with only `contents: read` and
   `id-token: write`. Actions are GitHub-owned and pinned to full commit SHAs.
6. Protected `main`, the release-tag ruleset, private vulnerability reporting,
   secret scanning, push protection, and dependency security updates remain
   enabled as checked by `scripts/verify-release-configuration.mjs`. Secret
   scanning validity checks and non-provider patterns remain mandatory whenever
   the organization plan licenses them.

Before creating a tag and again before approving the environment, an authorized
operator runs:

```sh
GITHUB_TOKEN="$(gh auth token)" node scripts/verify-release-configuration.mjs
```

The token must remain in the operator credential store. Never write it to the
repository, workflow output, artifact, issue, or shell history.

## Release Procedure

1. Merge the exact version, lockfile, source, and release documentation
   to protected `main` after the required exact-SHA Code Review, Security Review,
   and Release Quality gates.
2. Verify repository controls with the configuration guard above. Confirm the
   target version does not already exist and `borgmcp-shared` is owned solely by
   `byteventures`.
3. Obtain the separately required exact-commit tag authorization. Create and push
   one annotated `v<package-version>` tag at that protected-main commit.
4. The tag starts the single publish job and leaves it pending at the protected
   `npm-publish` environment. Do not use workflow rerun controls; every immutable
   tag gets one first attempt.
5. Obtain the separately required environment approval, then approve that exact
   pending job. Approval does not permit a local rebuild or alternate artifact.
6. Require the protected publish job to complete successfully before announcing
   the version or updating consumers. Registry propagation and later consumer
   availability are operational observations, not release-workflow gates.

## Coupled Publication Window

The shared, server, and client packages are published independently. The current
release workflows publish directly to npm's default `latest` dist-tag, so the
least-bad order is shared first, server second, and client third. This keeps each
consumer pointed at an immutable shared artifact, but it cannot make the three
`latest` pointers atomic.

During that sequence, a user can install the newest server and newest client
while they still carry different protocol tags. Their credential-free preflight
fails closed by design; this is a publication-window mismatch, not a negotiation
or fallback case. The user remedy is to install the matching coupled shared,
server, and client versions from the coordinated release rather than retrying
`latest`. Do not describe this window as eliminated or promise an atomic
multi-package publication until all three release workflows support that shape.

The workflow publishes only `./release/<tarball>`. It never publishes from the
repository directory, a package name, a URL, a prior workflow artifact, or a
locally rebuilt replacement.

## Stop And Recovery

Stop before publication when source identity, tag ancestry, repository
visibility, environment protection, expected owner, target-version absence,
tests, build output, tarball policy, clean-consumer imports, or Trusted Publishing
configuration cannot be verified.

If a first-attempt tag run fails before npm accepts the version, preserve the tag
and run as immutable evidence. Fix the source and begin a separately reviewed and
authorized version/tag plan. Never move, reuse, rerun, or force-update the failed
tag.

Once npm accepts the version, the immutable release has occurred. Never rerun,
republish, overwrite, unpublish, or silently substitute a replacement because a
later registry read is delayed or unavailable.

## Failed-Superseded Recovery

The tag-triggered workflow is single-job and first-attempt-only. If attempt 1
fails before the tarball is built, the tarball is verified, the clean consumer
is exercised, or `npm publish` runs, preserve the failed tag and run as immutable
evidence. The failed version is not an install target and must not be rerun.

Record the failure and prepare a newer version only from a clean tree:

```sh
npm run release:prepare -- <next-version> \
  --workflow-run-id <failed-tag-run-id> \
  --workflow-run-attempt 1 \
  --workflow-conclusion failure
```

The release identity verifier binds the record to the annotated tag, the exact
workflow run and commit, the completed failed `publish` job, and the skipped
tarball, clean-consumer, and publish steps. It independently checks the npm
version list for registry absence. An attempt-2 run, a failure after packaging
or publication, an artifact integrity value on a failed record, or a version
present in npm is rejected. The generated record is `failed-superseded`; the
next release uses a new version and a new annotated tag.

## Immutable Historical Evidence

These records remain evidence, not reusable release inputs:

- `v0.2.0` run `29353763609` and `v0.2.1` run `29355823822` failed before
  artifact creation or publication.
- Protected-main proof runs `29356980492` and `29357632667` diagnosed and then
  verified the earlier tag/source and local-file handling. They are not publish
  artifacts.
- Run `29360398007` published `borgmcp-shared@0.2.2`; its initial ownership
  readback hit registry propagation. Independent integrity, ownership,
  provenance, and npm signature verification completed before consumer adoption.
- `v0.4.1` run `29701429995` exposed a non-deterministic cross-platform SBOM
  audit path and was never published.
- `borgmcp-shared@0.4.2` is accepted as published and verified. Its registry
  integrity matches the audited tarball and npm verifies its signature and
  attestation. Publish run `29729515410` must not be rerun; the failed custom
  postpublish check reconstructed the wrong workflow identity and is the reason
  that machinery was removed.

`borgmcp-shared@0.4.3`, `borgmcp-shared@0.5.0`, and `borgmcp-shared@0.5.1`
are published and immutable. The annotated `v0.5.1` tag object `045268aa8873da330819860012ecaddb4bc2883c`
peels to protected-main commit `1981d7373e77f6edb4567872c1544bdbe2b1ef20`. Attempt-1 workflow run
`29984423571` published registry integrity `sha512-XUJq+FjY/cbarU9V1dIWnhNYcqyURTiGb6KyIzg99gy5hk/fEs5ee/8X/qvp7pw1Rshqt2J6I3TVbwJdlde2tA==`; its
postpublish signature check raced registry propagation and the immutable run ended
failed. Independent pinned npm verification confirmed the registry signature and
SLSA provenance, and the incident was explicitly accepted. Never rerun or move
that tag. `borgmcp-shared@0.6.0` was never published. Its annotated tag object
`90a1cf686a0ce32a7aef836b0b82a930191b9030` peels to protected-main commit
`fd69b08586481a60c88099dede8e4e066f73f2f2`; attempt-1 workflow run
`30054936226` failed in tests before build, packaging, authentication, or registry
mutation. Never rerun or move that tag. `borgmcp-shared@0.6.1`,
`borgmcp-shared@0.6.2`, and `borgmcp-shared@0.6.3` are published and immutable.
`borgmcp-shared@0.6.4` is published and immutable: annotated tag object
`f79b0683686d3c359023a17f6e8a92efd888104a` peels to protected-main commit
`fa8a2dc072d4ffe2a16d5f02576fead822a2f72e`; successful attempt-1 workflow run
`30169732628` published registry integrity
`sha512-Wm4b0uoOAw9JCz5OTHD0Q2uXKkeWYdkVksdeZvRG8l62XGMY+G8GkNEsZT9L533LbVbQ29GhgF0htjDenQThDg==`.
Never rerun or move that tag. `borgmcp-shared@0.7.0`,
`borgmcp-shared@0.7.1`, and `borgmcp-shared@0.9.0` are published and immutable.
Consumers must update the reviewed shared artifact before adopting the matching
server and client releases; incompatible protocol v2, v3, v4, v5, v6, and v7
peers fail closed at credential-free preflight.
