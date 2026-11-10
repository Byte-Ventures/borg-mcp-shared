# scripts

## Overview

Release and packaging tooling for the `borgmcp-shared` npm package. These Node.js ESM scripts check the packed tarball, check the release identity (that the version bump is the only change), check npm registry state before and after publish, and create the GitHub Release. They are not part of the package: `scripts/` is not in the `package.json` `files` allowlist.

Callers:

- `package.json` scripts: `verify:artifact`, `release:prepare` and `verify:release-identity`.
- `.github/workflows/publish.yml` runs `verify-registry-release.mjs prepublish` on the packed tarball.
- `.github/workflows/ci.yml` (pull requests only) runs the base commit's copy of `release-identity.mjs verify <base> <candidate>` when the package version changes.
- No workflow calls `create-github-release.mjs` or `verify-packed-artifact.mjs` directly. `verify-packed-artifact.mjs` runs through `verify-registry-release.mjs` and `test/packed-artifact.test.ts`.

## Interface

- `verify-packed-artifact.mjs`
  - Usage: `node scripts/verify-packed-artifact.mjs <package.tgz>`.
  - Exports `verifyPackedArtifact(tarballPath)`.
  - Prints `{name, version, fileCount, packedBytes, unpackedBytes, sourceMapCount, readmeRelativeLinkCount, integrity}`, where `integrity` is `sha512-` plus the base64 SHA-512 of the tarball.
- `release-identity.mjs`
  - Usage: `node scripts/release-identity.mjs prepare <version>` or `node scripts/release-identity.mjs verify <base-sha> <candidate-sha>`.
  - Exports:
    - `buildReleaseTransform(files, oldVersion, newVersion)`
    - `prepareRelease(root, targetVersion)`
    - `verifyReleaseIdentity(root, base, candidate)`
  - Types are in `release-identity.d.mts`.
  - The version carrier files are `package.json`, `package-lock.json` and `VERSION_PIN_PATHS`: `scripts/verify-packed-artifact.mjs`, `src/protocol/contract.ts`, `test/packed-artifact.test.ts` and `test/protocol-contract.test.ts`.
- `verify-registry-release.mjs`
  - Usage: `node scripts/verify-registry-release.mjs prepublish <package.tgz>` or `node scripts/verify-registry-release.mjs postpublish <name> <version> <integrity>`.
  - Exports:
    - `readWithPropagationRetry(read, description, {attempts = 18, maxDelayMs = 15000, wait})`
    - `prepublish(name, version, {expectedOwner, read})`
    - `postpublish(name, version, integrity, {read, retry})`
  - Reads the environment variables `NPM_EXPECTED_OWNER` and `GITHUB_OUTPUT`.
- `create-github-release.mjs`
  - Usage: `node scripts/create-github-release.mjs <version> --integrity <sha512-SRI>`.
  - Exports:
    - `assembleReleaseBody({packageName, version, integrity, tag, commit, releaseNotes})`
    - `createGithubRelease(version, integrity, {root, token, authorities})`
  - Types, including `GithubReleaseAuthorities`, are in `create-github-release.d.mts`.
  - Reads the environment variable `GITHUB_TOKEN`.
- Import graph: `create-github-release.mjs` imports `postpublish` from `verify-registry-release.mjs`, and `verify-registry-release.mjs` imports `verifyPackedArtifact` from `verify-packed-artifact.mjs`.

## Invariants

- `verify-packed-artifact.mjs` (`verifyPackedArtifact`):
  - No `.npmrc` may exist in the working directory.
  - Size limits:
    - The tarball is at most 512 KiB.
    - The package has at most 128 files.
    - Each file is at most 256 KiB.
    - The total unpacked size is at most 1280 KiB.
  - Tarball entries:
    - Every entry is under `package/`.
    - There are no duplicate entries. No entry contains the substring `/../`, and no entry starts with `/`. The check does not reject a trailing `/..`.
    - There are no symlinks.
  - Allowed content:
    - Top-level entries are limited to `ALLOWED_ROOTS`: `CONTRIBUTING.md`, `LICENSE`, `NOTICE`, `README.md`, `RELEASES.md`, `SECURITY.md`, `dist`, `docs`, `package.json` and `src`.
    - `dist/` may contain only `.js` and `.d.ts` files (with optional `.map`), `src/` only `.ts` files, and `docs/` only `.md` and `.json` files.
    - The scan rejects any file that matches `FORBIDDEN_CONTENT`: private keys, npm or GitHub tokens, postgres URLs, local absolute paths, and the hosted-product terms listed in the script.
  - Required files: `LICENSE` (the SHA-1 is pinned to the Apache-2.0 text), the exact `NOTICE` text, `README.md`, `RELEASES.md`, `SECURITY.md` and `package.json`.
  - `package.json` checks:
    - The name is `borgmcp-shared` and the version equals the pinned version, which is a release-identity carrier.
    - `repository.url`, `main` and `types` have the expected values, and `exports` deep-equals `EXPECTED_EXPORTS`.
    - `publishConfig` is exactly `{access: 'public'}`.
    - There are no runtime, optional, peer or bundled dependencies.
    - No lifecycle script in `FORBIDDEN_HOOKS` is present.
  - Every relative link in `README.md` must point to a file in the tarball.
  - Source maps:
    - There must be at least one.
    - Each one must be version 3, with no `sections` and no `sourcesContent`.
    - Each source path must be relative and resolve to a file in the tarball.
- `release-identity.mjs`:
  - The target version must be a stable `x.y.z` and strictly greater than the base version.
  - `buildReleaseTransform` rewrites the manifest and lockfile as canonical JSON and replaces every occurrence of the old version in each `VERSION_PIN_PATHS` file. Each file must contain the old version before the rewrite, and none may remain after it.
  - `prepare` requires a clean `git status --porcelain` and a non-blank `docs/releases/<version>.md` at `HEAD`.
  - `verify` has these requirements:
    - Both arguments are 40-hex SHAs, and the base is an ancestor of the candidate.
    - Every carrier file at the candidate is byte-identical to the transform of the base.
    - `docs/releases/<newVersion>.md` exists and is non-blank.
- `verify-registry-release.mjs`:
  - `prepublish` has these requirements:
    - `<name>/<version>` returns 404 on the registry, so an existing version is a failure.
    - `expectedOwner` is exactly `byteventures`, and that account is the package's only maintainer.
  - `postpublish` makes at most 18 attempts (17 retries) while the registry returns 404. The delay before retry `n` is `1000 * 2^(n-1)` ms, capped at 15 s. The registry `dist.integrity` must equal the expected integrity.
  - Values written to `GITHUB_OUTPUT` must not contain CR or LF.
- `create-github-release.mjs`:
  - Version and integrity input:
    - The version is a stable `x.y.z`.
    - The integrity matches `sha512-` followed by 86 base64 characters and `==`.
    - The token is non-empty.
  - Tag and notes:
    - `refs/tags/v<version>` is an annotated tag with a non-empty message.
    - `docs/releases/<version>.md` is non-blank at the tag commit.
  - Registry and GitHub state:
    - The registry integrity matches (through `postpublish`).
    - No GitHub Release exists yet for the tag; the lookup must return 404.

## Side Effects

- `verify-packed-artifact.mjs` runs `tar -t` and `tar -x`. It extracts into an `os.tmpdir()` `mkdtemp` directory and deletes that directory recursively in a `finally` block. It makes no network calls and does not run `npm pack`.
- `release-identity.mjs`:
  - `prepare` runs `git status` and `git show`. It then overwrites `package.json`, `package-lock.json` and the four `VERSION_PIN_PATHS` files in place.
  - `verify` is read-only. It runs `git merge-base --is-ancestor` and `git show`.
- `verify-registry-release.mjs` sends GET requests to `https://registry.npmjs.org`. The `prepublish` CLI appends `name=`, `version=` and `integrity=` lines to `$GITHUB_OUTPUT` when that variable is set.
- `create-github-release.mjs` runs `git` (`cat-file`, `rev-parse`, `for-each-ref`, `show`). It sends GET requests to the npm registry and to `api.github.com`, then POSTs to `/repos/Byte-Ventures/borg-mcp-shared/releases` with the bearer `GITHUB_TOKEN`, which creates a public GitHub Release with `make_latest: 'true'`.

## Verification

- Run: `npm test` (`test/packed-artifact.test.ts` runs `npm pack` and `verify-packed-artifact.mjs`).
- Run: `npm run check`.
