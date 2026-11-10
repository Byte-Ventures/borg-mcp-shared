# borg-mcp-shared Blueprint

## System Overview

`borgmcp-shared` 3.0.0 is the implementation-neutral contract shared by the Borg MCP client ([borg-mcp-client](https://github.com/Byte-Ventures/borg-mcp-client), npm `borgmcp`) and server ([borg-mcp-server](https://github.com/Byte-Ventures/borg-mcp-server), npm `borgmcp-server`). It defines protocol version `'15'` (`src/protocol/version.ts`): wire envelopes, the HTTP route table, limits, error codes and strict decoders. It also defines the shared domain helpers, the cube templates, and portable conformance vectors with an adapter harness that each implementation runs. It has no runtime dependencies and keeps platform adapters, persistence and transport out of the package. [AGENTS.md](./AGENTS.md) is authoritative.

Public entry points (`package.json` `exports`): `.`, `./templates`, `./role-section`, `./log-stream-hwm`, `./drone-address`, `./runtime-metadata`, `./protocol`, `./domain`, `./conformance`, `./package.json`.

## Local Interface & Invariants

- `vitest.config.ts`: Vitest with `testTimeout` 60 000 ms and no other options.
- `package.json`: `engines.node` is `>=22.12.0`. `dependencies` is empty. `files` = `dist`, `src`, `README.md`, `RELEASES.md`, `LICENSE`, `NOTICE`, `SECURITY.md`, `CONTRIBUTING.md`, `docs`. `prepack` runs build, check and test.

## Subdirectories & System Boundaries

The `src/` contracts are stored in `egm/src/`, not in `src/`. `src/` is packed to npm, and `scripts/verify-packed-artifact.mjs` rejects any non-`.ts` file under `src/`.

- src: [./egm/src/EGM.md](./egm/src/EGM.md). The root public surface (`src/index.ts`), plus `templates.ts` (`TEMPLATES`: `software-dev`, `starter`, `local-model`), `role-section.ts`, `runtime-metadata.ts`, `drone-address.ts` and `log-stream-hwm.ts`.
  - src/protocol: [./egm/src/protocol/EGM.md](./egm/src/protocol/EGM.md). `PROTOCOL_VERSION`, `PROTOCOL_HTTP_CONTRACT`, `PROTOCOL_LIMIT_CEILINGS`, the `ErrorCode` enum, envelope/payload decoders, the SSE codec, and `ProtocolContractError`.
  - src/domain: [./egm/src/domain/EGM.md](./egm/src/domain/EGM.md). The `./domain` barrel (drone address, broadcast HWM, role sections, template types).
  - src/conformance: [./egm/src/conformance/EGM.md](./egm/src/conformance/EGM.md). The `*_CONFORMANCE` vectors and `runAdapterConformance` (35 adapter fixtures).
- scripts: [./scripts/EGM.md](./scripts/EGM.md). Release tooling that is not shipped: `verify-packed-artifact.mjs`, `release-identity.mjs`, `verify-registry-release.mjs`, `create-github-release.mjs`.

`docs/` (compatibility, releasing, release notes) and `test/` contain no production code and have no contract.

## Global Invariants

- Protocol compatibility is exact-match. `decodeProtocolEnvelope` rejects any tag other than `PROTOCOL_VERSION` with `UNSUPPORTED_PROTOCOL_VERSION`, and there is no negotiation. Client and server consume an exact published version of this package and are released as a matched pair.
- A wire-visible change needs an issue first, protocol-tag coordination, and implementation-neutral vectors in `src/conformance/`.
- The package has no runtime dependencies. Adding one is an architectural change.
- A new public entry point updates `package.json` `exports`, the expected exports in `scripts/verify-packed-artifact.mjs`, and the tests together.
- Edit `src/`, never `dist/`. `dist/` is generated and gitignored. Use pure ESM (`NodeNext`) with `.js` extensions in relative imports.
- Only `.ts` files go under `src/` (enforced by `scripts/verify-packed-artifact.mjs`).
- Releases are tag-triggered through `.github/workflows/publish.yml`. Never publish locally. Never create or push a release tag without explicit authorization.

## Global Side Effects

- The library itself is pure. Its only exceptions are `crypto.subtle` SHA-256 in `deriveAttachmentReceipt`, `globalThis.URL` in invitation endpoint parsing, module-load computation, and the shared mutable `TEMPLATES` record.
- `runAdapterConformance` resets and mutates the system under test through the adapter that the implementation supplies. It also uses `globalThis.setTimeout` and `globalThis.clearTimeout`, and calls `deriveAttachmentReceipt`.
- Release scripts run `tar` and `git`, rewrite version files (`release-identity.mjs prepare`), read `registry.npmjs.org`, append to `$GITHUB_OUTPUT`, and POST GitHub Releases with `GITHUB_TOKEN`.

## System Verification

- Run: `npm test`
- Run: `npm run check` (type-checks the source and the tests)
- Before a package-surface change: `npm run build && npm run check && npm test && npm pack --dry-run --ignore-scripts`
