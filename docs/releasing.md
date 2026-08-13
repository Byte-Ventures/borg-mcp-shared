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
2. installs locked dependencies without lifecycle scripts and runs one dependency
   audit and one clean build;
3. creates one local tarball, enforces the packed-artifact policy, and installs
   that tarball into a clean consumer that imports every public export;
4. rejects an existing immutable version or a package not owned solely by the
   configured npm owner before any registry mutation;
5. stages that exact local tarball through npm Trusted Publishing with
   provenance. Successful completion of `npm stage publish` means npm accepted
   the immutable stage; it does not mean the version is publicly available.

The release becomes live only after the authorized operator approves the stage
with 2FA and the canonical registry exposes the expected version and integrity.
No workflow post-publication readback can fail a release after that boundary.

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
   Its allowed actions enable `npm stage publish` and disable `npm publish`.
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
   enabled as repository controls, not per-release evidence snapshots.

## Release Procedure

1. Merge the exact version, lockfile, source, and release documentation
   to protected `main` after the required exact-SHA Code Review, Security Review,
   and Release Quality gates.
   Release documentation includes curated `docs/releases/<version>.md` notes.
   The GitHub Release operator reads those exact bytes from the tagged commit
   under `News and fixes`.
2. Confirm the target version does not already exist and `borgmcp-shared` is
   owned solely by `byteventures`.
3. Obtain the separately required exact-commit tag authorization. Create and push
   one annotated `v<package-version>` tag at that protected-main commit.
4. The tag starts the single publish job and leaves it pending at the protected
   `npm-publish` environment. A failed pre-stage workflow may be rerun after its
   cause is corrected; the version is not consumed until npm accepts a stage.
5. Obtain the separately required environment approval, then approve that exact
   pending job. Approval does not permit a local rebuild or alternate artifact.
6. Require the protected publish job to complete successfully before announcing
   that the stage is ready. Record its stage UUID; do not announce the version,
   update consumers, synchronize the site, create a GitHub Release, or record a
   `published` outcome while it remains staged.

Before release preparation or trusted identity verification can pass, the
greatest stable npm version below the current package version must already have a
`published` ledger entry. This prevents a later release from silently skipping
the immediately previous publication. A final `"reconstructed": true` marker
means the entry was recovered later from the same annotated-tag, Actions-run, and
npm-integrity authorities; it does not weaken verification or change the outcome.

## Coupled Stage Approval

For a coordinated shared, server, and client release, require all three tag
workflows to succeed before approving any stage. Use authenticated `npm stage
list` and `npm stage view` to record and verify each UUID, package, version, and
`latest` tag. Bind each source run, annotated tag, and commit separately from
GitHub workflow and tag evidence. Before any approval, run `npm stage download
<UUID>` for every package. For server and client, verify the downloaded SHA-512
against the same-run artifact report. For shared, independently compute and
record the stage-download SHA-512 SRI, then carry that exact value into the
required post-approval `--integrity` argument; shared has no same-run artifact
report. Exercise the exact downloaded coupled set before approving any stage.
Confirm public `latest` and the public version lists still describe the prior
coherent set.

Approve the verified stages in one operator session with 2FA:

1. `npm stage approve <shared-stage-uuid>`
2. `npm stage approve <server-stage-uuid>`
3. `npm stage approve <client-stage-uuid>`

The three approvals are not atomic. Shared-first does not change the exact
shared pins of the live client and server. Server-second opens a bounded window
in which `latest` client and server may not match; client-third closes it. Staging
reduces that window to the approval sequence but does not eliminate it.

After each approval, continue only while the remaining stage is still the exact
verified candidate. Resolve an ambiguous approval through authenticated stage
state and canonical public version/integrity state; never repeat it blindly.
After all approvals:

1. Verify the three live versions, integrities, and registry provenance
   attestations, and exercise a fresh coupled install. Only then announce,
   record, close, or synchronize the release.
2. Create the three GitHub Releases in the same operator session, in shared,
   server, then client order. For shared, pass the SHA-512 SRI computed from the
   mandatory stage download during promotion:

```sh
GITHUB_TOKEN="$(gh auth token)" node scripts/create-github-release.mjs <version> --integrity <sha512-SRI>
```

This required value binds npm-live to the independently verified staged bytes.
Unlike server and client, shared uploads no same-run artifact report; do not
derive the expected integrity from npm or alter `publish.yml` to create one.

## Coupled Publication Window

The shared, server, and client packages are approved independently from private
npm stages. Pending stages are not publicly installable and do not change
`latest` or the public version list. Approval order is shared first, server
second, and client third. This keeps each consumer pointed at an immutable shared
artifact, but it cannot make the three approvals atomic.

During that sequence, a user can install the newest server and newest client
while they still carry different protocol tags. Their credential-free preflight
fails closed by design; this is a publication-window mismatch, not a negotiation
or fallback case. The user remedy is to install the matching coupled shared,
server, and client versions from the coordinated release rather than retrying
`latest`. Do not describe this window as eliminated or promise an atomic
multi-package publication until npm supports atomic multi-package approval.

The workflow stages only `./release/<tarball>`. It never stages from the
repository directory, a package name, a URL, a prior workflow artifact, or a
locally rebuilt replacement.

## Stop And Recovery

Stop before staging when source identity, tag ancestry, repository
visibility, environment protection, expected owner, target-version absence,
tests, build output, tarball policy, clean-consumer imports, or Trusted Publishing
configuration cannot be verified.

Before any stage approval, approve none if any coupled stage or its evidence is
missing or wrong. If the coupled candidate is abandoned, reject all three stages
with 2FA. Never move a release tag. A version is consumed when npm accepts its
stage.

After shared approval but before server approval, stopping preserves live
client/server compatibility, though the shared version is immutable and any
replacement needs a new version. After server approval, prioritize the already
verified client approval because the public mismatch window is open. If that
client cannot be approved, preserve the failed evidence and prepare newly
reviewed matching server/client recovery versions; do not reject, rerun, or
silently substitute the tagged client.

If a tag run fails before npm accepts the stage, fix the cause and rerun the same
immutable tag workflow. Do not move or force-update the tag.

Once npm accepts a stage, the candidate version is consumed. Once the operator
approves it, the immutable live release has occurred. Never republish, overwrite,
unpublish, or silently substitute a replacement because a later registry read is
delayed or unavailable.

## Failed-Superseded Recovery

Use failed-superseded recovery only when a failed tag is intentionally abandoned
before npm accepts a stage, rather than for an ordinary corrected workflow rerun.

Record the failure and prepare a newer version only from a clean tree:

```sh
npm run release:prepare -- <next-version> \
  --workflow-run-id <failed-tag-run-id> \
  --workflow-run-attempt <failed-run-attempt> \
  --workflow-conclusion failure
```

The release identity verifier binds the record to the annotated tag, exact
workflow run and commit, and npm version absence. It does not reconstruct runner
steps. The generated record is `failed-superseded`; the next release uses a new
version and annotated tag.

## Immutable Historical Evidence

These records remain evidence, not reusable release inputs:

Eight published versions from 0.2.2 through 0.6.2, excluding the isolated 0.4.0
baseline, are the pre-convention boundary. Their workflow runs ended in failure
despite registry publication, which the canonical record schema cannot represent,
so the incident prose remains their record rather than force-fitting them into
`docs/release-records.json`. The 0.4.2 publication additionally came from a
`workflow_dispatch` run on `main`; 0.4.0 is also excluded from reconstruction.

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
