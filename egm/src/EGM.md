# src

Contract for `src` (stored outside `src/` because `src/` is packed to npm).

## Overview

`src/` is the root public surface of `borgmcp-shared`, the implementation-neutral contract shared by borg clients and servers. [`index.ts`](../../src/index.ts) re-exports the protocol, domain and conformance modules, plus `templates` and `runtime-metadata`. Each top-level helper module also has its own subpath export in `package.json`.

## Interface

Top-level modules:

- [`templates.ts`](../../src/templates.ts)
  - Data: `TEMPLATES` (`software-dev`, `starter`, `local-model`) and `NEW_CUBE_TEMPLATE_PRESENTATIONS`.
  - Lookup: `getTemplate`, `listTemplateNames`.
  - Resolvers: `resolveCubeDirectiveForCreate`, `resolveCubeDirectiveForApply`, `resolveMessageTaxonomyForCreate`.
  - Discipline prose constants: `UNIVERSAL_SAFETY_DISCIPLINES`, `ROLE_SCOPED_SAFETY_DISCIPLINES` and the individual `*_DISCIPLINE` strings.
  - Types: `Template`, `TemplateRole`, `MessageTaxonomy`.
- [`role-section.ts`](../../src/role-section.ts)
  - Functions: `isLabelLine`, `parseRoleSections`, `serializeSections`, `patchRoleSectionText`.
  - Types: `RoleSection`, `RoleSectionPatchOp`.
- [`runtime-metadata.ts`](../../src/runtime-metadata.ts)
  - Limits and errors: `RUNTIME_METADATA_LIMITS`, `RuntimeMetadataValidationError`.
  - Validators: `validateReportedModel`, `validateWorkingRepoName`, `validateRuntimeMetadata`, `validateRuntimeMetadataPatch`, `validateRuntimeMetadataReportState`.
  - Canonicalization: `canonicalizeRepositoryIdentity`.
- [`drone-address.ts`](../../src/drone-address.ts): `shortDroneId`, `formatDroneAddressToken` (returns `` `id:xxxxxxxx` ``).
- [`log-stream-hwm.ts`](../../src/log-stream-hwm.ts): `BroadcastHwm`, `compareBroadcastHwm`.

Child contracts:

- [protocol](./protocol/EGM.md): the wire contract, route table, error codes and strict decoders.
- [domain](./domain/EGM.md): the barrel module for domain helpers.
- [conformance](./conformance/EGM.md): portable vectors and the adapter conformance runner.

## Invariants

- Role-section parsing (`role-section.ts`):
  - `serializeSections(parseRoleSections(t)) === t` holds byte for byte.
  - A line starts a section only if it is a plain `Label:` line: no leading whitespace, a label of at most 60 characters, and no markdown prefix.
  - `patchRoleSectionText` matches headings case-insensitively. A `replace` or `delete` of a missing heading throws, and an `insert` of an existing heading throws.
- Runtime metadata (`validateRuntimeMetadata`):
  - `agent_kind` is `claude`, `codex`, `opencode` or `null`.
  - The repository name and origin are set together or cleared together.
  - Origins are canonicalized to `https://<public host>/<owner>/<repo>`. Origins with credentials, a non-default port, a query, a `file:` scheme or a private host are rejected.
- `validateRuntimeMetadataReportState` rejects `runtime_metadata_reported = false` if any metadata value is non-null.
- `getTemplate` checks own properties only, so prototype keys such as `toString` return `null`.
- Package rules from AGENTS.md:
  - The package has no runtime dependencies.
  - Source is ESM with `NodeNext` resolution, and relative imports use `.js` extensions.
  - A new public entry point requires updating `package.json` exports, `EXPECTED_EXPORTS` in `scripts/verify-packed-artifact.mjs` and the tests in the same change.
- Every file under `src/` must be a `.ts` file. The packed-artifact verifier rejects any other file there.

## Side Effects

- `TEMPLATES` is a mutable record at module level, and `getTemplate` returns the shared object by reference, not a copy.
- Every other top-level helper module is pure: it does no I/O and reads no environment variables. The child directories are not all pure: `deriveAttachmentReceipt` uses Web Crypto, and `runAdapterConformance` drives the adapter and uses timers. See the child contracts.

## Verification

- Run: `npm test`
- Run: `npm run check`
