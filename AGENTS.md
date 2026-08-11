# Repository Guidance

## Scope and architecture

- This package is the implementation-neutral contract shared by borg clients and servers. Keep platform adapters, persistence, transport ownership, and application-specific policy out of it.
- The package has no runtime dependencies. Treat a proposed runtime dependency as an architectural change, not a convenience.
- `src/protocol/` owns wire envelopes and protocol constants. `src/domain/` owns shared domain types. `src/conformance/` owns portable behavioral vectors that implementations run through an adapter.
- `src/index.ts` is the root public surface. Subpath exports are declared explicitly in `package.json`; adding a public entry point requires updating both surfaces and the packed-artifact checks.

## Source and generated output

- The project is pure ESM with TypeScript `module`/`moduleResolution` set to `NodeNext`. Use `.js` extensions in relative imports written in `.ts` files.
- Edit `src/`, never `dist/` directly. `npm run build` deletes and regenerates `dist/`, including declarations, source maps, and JavaScript.
- `dist/` is generated and gitignored. Releases and `prepack` rebuild it from source; never add it to commits.
- The npm package uses a strict `files` allowlist, explicit exports, and `scripts/verify-packed-artifact.mjs`. Any change to packaged roots or entry points must update those constraints and their tests together.

## Protocol and conformance changes

- Wire-visible behavior changes require an issue before implementation, exact protocol-tag coordination, and implementation-neutral vectors in `src/conformance/`. Update the adapter driver when a vector needs a new operation.
- Do not silently accept multiple protocol tags. Compatibility is exact-match by design; coordinate client and server rollout as documented in `docs/compatibility.md`.
- Keep conformance vectors deterministic and portable. They must describe observable behavior without assuming a specific storage engine, process model, or SDK.

## Verification

- Run one test file while iterating: `npx vitest run test/<name>.test.ts`.
- Run one named test while iterating: `npx vitest run test/<name>.test.ts -t '<test name>'`.
- Before committing source or package-surface changes, run the CI sequence: `npm run check`, `npm test`, `npm run build`, and `npm pack --dry-run --ignore-scripts`. Build output must not appear in `git status`.
- `npm run check` type-checks both source and TypeScript tests; there is no separate lint script.
- CI supports Node.js 20 and 22. Release reproduction uses the exact Node/npm versions documented in `docs/releasing.md`.

## Releases

- Do not publish locally. Releases are tag-triggered through `.github/workflows/publish.yml`, which verifies the clean packed artifact and npm provenance.
- Do not create or push release tags unless the user explicitly authorizes a release.
