# @borgmcp/shared

`@borgmcp/shared` is the implementation-neutral contract package for Borg MCP.
It contains the protocol types, domain helpers, built-in cube templates, and
portable conformance vectors used by the hosted service, the `borgmcp` client,
and self-hosted Borg MCP servers.

The package deliberately contains no authentication, billing, database,
Cloudflare, filesystem, process-management, or MCP transport implementation.
Those concerns remain with the applications that own them.

## Installation

```sh
npm install @borgmcp/shared
```

The package is ESM-only and supports Node.js 20 or newer.

## Public API

The root entry point exports the complete supported API:

```ts
import {
  PROTOCOL_VERSION,
  TEMPLATES,
  compareBroadcastHwm,
  parseRoleSections,
} from '@borgmcp/shared';
```

Focused subpath exports let consumers keep their dependency boundary explicit:

```ts
import { TEMPLATES } from '@borgmcp/shared/templates';
import { patchRoleSectionText } from '@borgmcp/shared/role-section';
import { compareBroadcastHwm } from '@borgmcp/shared/log-stream-hwm';
import { formatDroneAddressToken } from '@borgmcp/shared/drone-address';
import type { AppendLogRequest } from '@borgmcp/shared/protocol';
import { BROADCAST_HWM_CONFORMANCE } from '@borgmcp/shared/conformance';
```

The supported subpaths are:

- `@borgmcp/shared/protocol`: wire entities, requests, responses, errors, and
  protocol compatibility metadata.
- `@borgmcp/shared/domain`: pure role-section, address, and high-water-mark
  helpers plus shared domain types.
- `@borgmcp/shared/conformance`: test-runner-independent behavior vectors.
- `@borgmcp/shared/templates`: built-in cube templates and template helpers.
- `@borgmcp/shared/role-section`: lossless role-text parsing and patching.
- `@borgmcp/shared/log-stream-hwm`: broadcast cursor ordering.
- `@borgmcp/shared/drone-address`: stable short drone-address rendering.

Generated declaration files are included in every published package. Public
functions and contracts include API documentation in their TypeScript sources.

## Conformance

Server and client implementations should run the vectors exported from
`@borgmcp/shared/conformance` against their adapters. The vectors are plain
readonly data rather than Vitest-specific helpers, so they work with any test
runner and in any JavaScript runtime.

The package's own suite also runs the original behavior tests for templates,
role-section patching, broadcast high-water-mark ordering, and drone-address
formatting.

## Compatibility

`PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, and `COMPATIBILITY_MATRIX`
describe the compatibility contract. During the pre-1.0 package series, new
contracts may be added, but an existing wire shape will not change without a
documented migration path and corresponding conformance coverage.

See [docs/compatibility.md](docs/compatibility.md) for the current matrix and
the policy for introducing protocol changes.

## Security Posture

This package is intentionally dependency-free at runtime and contains only
public, non-secret contracts and deterministic helpers. It must never contain
credentials, private backend configuration, database access, authentication
implementation, billing logic, or environment-specific infrastructure code.

Protocol types describe untrusted wire data; they do not replace runtime input
validation at a server boundary. Implementations remain responsible for
authenticating callers, authorizing every operation, enforcing resource limits,
and validating request bodies before using them.

Please report vulnerabilities through the private process in
[SECURITY.md](SECURITY.md), not through a public issue.

## Development

```sh
npm install
npm test
npm run check
npm run build
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.
