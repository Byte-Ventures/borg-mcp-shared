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
import { ADAPTER_CONFORMANCE_FIXTURES } from 'borgmcp-shared/conformance';
```

The supported subpaths are:

- `borgmcp-shared/protocol`: wire entities, requests, responses, errors, and
  protocol compatibility metadata.
- `borgmcp-shared/domain`: pure role-section, address, and high-water-mark
  helpers plus shared domain types.
- `borgmcp-shared/conformance`: test-runner-independent behavior vectors and
  the adapter conformance runner.
- `borgmcp-shared/templates`: built-in cube templates, template schemas, and helpers.
- `borgmcp-shared/role-section`: lossless role-text parsing and patching.
- `borgmcp-shared/log-stream-hwm`: broadcast cursor ordering.
- `borgmcp-shared/drone-address`: stable short drone-address rendering.

Generated declaration files are included in every published package. Public
functions and contracts include API documentation in their TypeScript sources.

## Handshake

The first-slice HTTP contract has four shared paths:

- `GET /healthz` is the only unauthenticated liveness probe. Success is `204`
  with no body or identifying metadata.
- `POST /api/enrollment/exchange` accepts a single-use invitation, canonical
  retry key, and client-generated 256-bit bearer in a bounded JSON body over
  verified TLS. It returns only stable non-secret client identity and server
  capabilities; owner enrollment grants `create_cube` but creates no cube. An exact
  credential-proven retry is non-mutating, and a mismatched replay fails
  uniformly. Secrets never belong in a response, URL, query string, command-line
  argument, diagnostic, or serializable domain entity.
- `GET /api/protocol` requires authentication and returns the protocol version,
  package version, capabilities, and bounded limits in the shared envelope.
- `POST /api/cubes` requires an active parent client with `create_cube`. Its
  strict, idempotent request selects a server-owned template; one atomic success
  creates a cube, two initial roles, and the creator's cube-scoped `manage`
  grant. Exact retries return the same non-secret identities without mutation.

`negotiateProtocol` requires bearer authentication, revocation, cube isolation,
verified TLS, and no-cloud-fallback capabilities. Missing security capabilities
fail closed before an operation begins.

Every JSON coordination request and successful JSON response is carried inside
`ProtocolEnvelope<T>`. Failures use `ProtocolErrorEnvelope`. The only bodyless
exceptions are the `204` liveness and acknowledgement responses. Payload codecs
are exported separately so adapters can validate the envelope first and then
validate the operation-specific payload without accepting ambiguous fields.
See [docs/enrollment.md](docs/enrollment.md) for purpose-bound owner enrollment,
ordinary ungranted enrollment, cube creation, pending-keychain, and retry contracts.

## Conformance

Server and client implementations should run the vectors exported from
`borgmcp-shared/conformance` against their adapters. The vectors and runner are
readonly data rather than Vitest-specific helpers, so they work with any test
runner and in any JavaScript runtime. Cases cover HTTP and canonical errors,
credential misuse, isolation and revocation, SSE framing/replay/cursor ordering,
executable enrollment authority/retry/mismatch/redaction and cube-create
idempotency, acks, claims, decisions, and
unsupported-capability failures.

Implement `AdapterConformanceDriver` with raw responses from the target adapter,
then call `runAdapterConformance`. The runner creates and decodes envelopes,
drives state transitions, and decides pass/fail; adapters do not submit expected
results. `runEquivalentAdapterConformance(cloud, local)` executes the identical
sequence against both implementations and fails when either implementation or
their normalized observable transcripts diverge.

The package's own suite covers built-in templates, role-section patching,
broadcast high-water-mark ordering, drone-address formatting, and current public
response shapes.

## Compatibility

`PROTOCOL_VERSION`, `SUPPORTED_PROTOCOL_VERSIONS`, and `COMPATIBILITY_MATRIX`
describe the compatibility contract. During the pre-1.0 package series, new
contracts may be added, but an existing wire shape will not change without a
documented migration path and corresponding conformance coverage. Consumers pin
`^0.3.0` (`>=0.3.0 <0.4.0`): before 1.0, breaking wire changes increment the
minor version while compatible additions and corrections increment the patch.

See [docs/compatibility.md](docs/compatibility.md) for the current matrix and
the policy for introducing protocol changes.

## Distribution

`borgmcp-shared@0.2.2` is the published legacy baseline. This source prepares
`0.3.0` for the breaking retry-safe enrollment and multi-cube creation contract;
the version change does not authorize a tag or publication. After a separately
authorized registry release, consumers adopting this contract pin
`borgmcp-shared@^0.3.0` and commit registry lockfiles. No registry token belongs
in this repository, package metadata, lockfiles, or a committed `.npmrc`;
publishing uses protected external credentials and provenance.

The first client and server releases must consume the reviewed registry release,
not a Git, tag, or local-path dependency. Public release requires the
packed-artifact sensitivity audit, ownership and Trusted Publisher checks,
provenance verification, and explicit release approval.

## Security Posture

The package publishes portable wire contracts, deterministic helpers, canonical
templates, and conformance data as dependency-free ESM.

Protocol types describe untrusted wire data; they do not replace runtime input
validation at a server boundary. Implementations remain responsible for
authenticating callers, authorizing every operation, enforcing resource limits,
and validating request bodies before using them.

The exported codecs reject unknown security fields, unsafe identifiers,
oversized payloads, and terminal control characters. Network adapters must also
enforce the published SSE and request byte limits while reading from the socket;
calling a decoder only after an unbounded response has been buffered is unsafe.

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
Release operators must follow the protected [publishing runbook](docs/releasing.md);
the runbook does not authorize a release.
