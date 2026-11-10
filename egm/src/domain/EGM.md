# src/domain

Contract for `src/domain` (stored outside `src/` because `src/` is packed to npm).

## Overview

This directory is the barrel module for shared domain helpers. The package publishes it as the `./domain` subpath export. [`index.ts`](../../../src/domain/index.ts) contains only re-exports and no runtime logic.

## Interface

- `export *` from [`../drone-address.js`](../../../src/drone-address.ts): `shortDroneId`, `formatDroneAddressToken`.
- `export *` from [`../log-stream-hwm.js`](../../../src/log-stream-hwm.ts): `BroadcastHwm`, `compareBroadcastHwm`.
- `export *` from [`../role-section.js`](../../../src/role-section.ts): `isLabelLine`, `parseRoleSections`, `serializeSections`, `patchRoleSectionText` and the role-section types.
- Type-only re-exports from [`../templates.js`](../../../src/templates.ts): `MessageTaxonomy`, `MessageTaxonomyClass`, `Template`, `TemplateRole`.
- It does not re-export `runtime-metadata`. That module is exported from the package root and from the `./runtime-metadata` subpath.

## Invariants

- None. The re-exported helpers are specified in [`../EGM.md`](../EGM.md).

## Side Effects

- None.

## Verification

- Run: `npm test`
- Run: `npm run check`
