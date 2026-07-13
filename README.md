# borgmcp-shared

`borgmcp-shared` is the implementation-neutral contract package for Borg MCP.
It contains protocol types, domain helpers, built-in cube templates, and
portable conformance vectors used by Borg MCP clients and server implementations.
Its pure ESM helpers and generated TypeScript declarations run consistently
across host environments with zero runtime dependencies.

## Installation

```sh
npm install borgmcp-shared
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
} from 'borgmcp-shared';
```

Focused subpath exports let consumers keep their dependency boundary explicit:

```ts
import { TEMPLATES } from 'borgmcp-shared/templates';
import { patchRoleSectionText } from 'borgmcp-shared/role-section';
import { compareBroadcastHwm } from 'borgmcp-shared/log-stream-hwm';
import { formatDroneAddressToken } from 'borgmcp-shared/drone-address';
import type { AppendLogRequest } from 'borgmcp-shared/protocol';
import { BROADCAST_HWM_CONFORMANCE } from 'borgmcp-shared/conformance';
```

The supported subpaths are:

- `borgmcp-shared/protocol`: wire entities, requests, responses, errors, and
  protocol compatibility metadata.
- `borgmcp-shared/domain`: pure role-section, address, and high-water-mark
  helpers plus shared domain types.
- `borgmcp-shared/conformance`: test-runner-independent behavior vectors.
- `borgmcp-shared/templates`: built-in cube templates, template schemas, and helpers.
- `borgmcp-shared/role-section`: lossless role-text parsing and patching.
- `borgmcp-shared/log-stream-hwm`: broadcast cursor ordering.
- `borgmcp-shared/drone-address`: stable short drone-address rendering.

Generated declaration files are included in every published package. Public
functions and contracts include API documentation in their TypeScript sources.

## Conformance

Server and client implementations should run the vectors exported from
`borgmcp-shared/conformance` against their adapters. The vectors are plain
readonly data rather than Vitest-specific helpers, so they work with any test
runner and in any JavaScript runtime.

The package's own suite covers built-in templates, role-section patching,
broadcast high-water-mark ordering, drone-address formatting, and current public
response shapes.

## Compatibility

`PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, and `COMPATIBILITY_MATRIX`
describe the compatibility contract. During the pre-1.0 package series, new
contracts may be added, but an existing wire shape will not change without a
documented migration path and corresponding conformance coverage.

See [docs/compatibility.md](docs/compatibility.md) for the current matrix and
the policy for introducing protocol changes.

## Security Posture

The package publishes portable wire contracts, deterministic helpers, canonical
templates, and conformance data as dependency-free ESM.

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
