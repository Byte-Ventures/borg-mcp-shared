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
import { canonicalizeRepositoryIdentity } from 'borgmcp-shared/runtime-metadata';
import type { AppendLogRequest } from 'borgmcp-shared/protocol';
import { ADAPTER_CONFORMANCE_FIXTURES } from 'borgmcp-shared/conformance';
```

The supported subpaths are:

- `borgmcp-shared/protocol`: wire entities, requests, responses, errors, and
  the exact protocol version tag.
- `borgmcp-shared/domain`: pure role-section, address, and high-water-mark
  helpers plus shared domain types.
- `borgmcp-shared/conformance`: test-runner-independent behavior vectors and
  the adapter conformance runner.
- `borgmcp-shared/templates`: built-in cube templates, template schemas, and helpers.
- `borgmcp-shared/role-section`: lossless role-text parsing and patching.
- `borgmcp-shared/log-stream-hwm`: broadcast cursor ordering.
- `borgmcp-shared/drone-address`: stable short drone-address rendering.
- `borgmcp-shared/runtime-metadata`: pure validation and canonical repository
  identity helpers for advisory local seat metadata.

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
- `GET /api/protocol` is credential-free and mutation-free. It returns ONLY the
  exact protocol tag — no package version, limits, server identity, or other
  fingerprint surface — so a client verifies pinned TLS and the exact tag before
  it creates or sends any credential.
- `POST /api/cubes` requires an active parent client with `create_cube`. Its
  strict, idempotent request selects a server-owned template; one atomic success
  creates a cube, two initial roles, and the creator's cube-scoped `manage`
  grant. Exact retries return the same non-secret identities without mutation.

`decodeProtocolTagPreflight` fails closed on any tag other than the exact
expected version, on any extra field, or on a non-object body — before any
credential is created or sent. The exact protocol tag is the sole acceptance
authority: there is no capability negotiation, and client and server ship and
update together as one clean-slate product. The attach request envelope still
decodes its version before any payload as defense in depth.

Every JSON coordination request and successful JSON response is carried inside
`ProtocolEnvelope<T>`. Failures use `ProtocolErrorEnvelope`. The only bodyless
exceptions are the `204` liveness and acknowledgement responses. Payload codecs
are exported separately so adapters can validate the envelope first and then
validate the operation-specific payload without accepting ambiguous fields.
Cube managers reassign a seat with `PATCH /api/cubes/:cubeId/drones/:droneId`
and evict one with `DELETE` on the same path. Both operations use strict
versioned request and success envelopes. An evicted seat's former bearer receives
the terminal `410 DRONE_EVICTED` signal; revoked sessions return
`401 SESSION_REVOKED`, while expired sessions return the only recoverable
authentication outcome, `401 AUTH_EXPIRED`.
An authenticated drone session updates only its own advisory identity with
`PATCH /api/cubes/:cubeId/drones/self/metadata`. The strict patch carries no
target seat ID. Metadata never grants authority or changes role, wake, liveness,
timestamp, log, routing, or model-execution state.
Identity responses include `runtime_metadata_reported`, keeping an omitted
attach report distinct from a reported all-null or explicitly cleared state.
See [docs/enrollment.md](docs/enrollment.md) for purpose-bound owner enrollment,
ordinary ungranted enrollment, cube creation, pending enrollment, and retry contracts.

## Conformance

Server and client implementations should run the vectors exported from
`borgmcp-shared/conformance` against their adapters. The vectors and runner are
readonly data rather than Vitest-specific helpers, so they work with any test
runner and in any JavaScript runtime. Cases cover HTTP and canonical errors,
credential misuse, isolation and revocation, SSE framing/replay/cursor ordering,
executable enrollment authority/retry/mismatch/redaction and cube-create
idempotency, acks, claims, decisions, cube-scoped drone reassignment, role-class
and single-seat invariants, eviction exclusion, and terminal bearer signaling.
The same runner covers complete attach reports, own-seat metadata self-healing,
canonical repository identity, invalid-patch atomicity, cross-cube isolation,
secret non-echo, and authority/liveness/log non-interference.
Manage-scoped cube, role, taxonomy, decision, and drone operations also share an
authority matrix: managing parents may mutate; known same-cube read/write
parents receive `403 ACCESS_DENIED`; drone sessions remain non-managing; and
no-grant, foreign, or unknown cubes remain hidden behind `404 NOT_FOUND`.

Implement `AdapterConformanceDriver` with raw responses from the target adapter,
then call `runAdapterConformance`. The runner creates and decodes envelopes,
drives state transitions, and decides pass/fail; adapters do not submit expected
results. Each server or client adapter runs this single portable suite against
its local/self-hosted implementation. The package does not define a second
authority, migration target, or fallback implementation.

The package's own suite covers built-in templates, role-section patching,
broadcast high-water-mark ordering, drone-address formatting, runtime metadata
canonicalization, and current public response shapes.

## Compatibility

`PROTOCOL_VERSION` is the sole acceptance authority: every envelope carries the
protocol tag, and each decoder fails closed on any value other than the exact
expected tag. There is no capability negotiation, supported-version list,
compatibility matrix, or version-range fallback. The client and server are one
clean-slate product — a wire change increments the tag and both adopt it
together in a coordinated release, with no mixed-version window.

See [docs/compatibility.md](docs/compatibility.md) for the exact-tag policy and
the coordinated rollout order for introducing protocol changes.

## Distribution

`borgmcp-shared@0.4.0` is the published clean-slate v2 baseline and is
immutable, but its artifact predates the local/self-hosted package cleanup. The
immutable `v0.4.1` verification artifact exposed a platform-dependent SBOM audit
and must never be published, moved, reused, rerun, or substituted.
`borgmcp-shared@0.4.2` is published and immutable. `borgmcp-shared@0.4.3` is the
immutable protocol v2 session-lifecycle release. `borgmcp-shared@0.5.0` is the
published protocol v3 attach-session contract release: attach responses carry the
exact non-expiring `session: { id }` shape. This source now identifies the
unpublished `0.5.1` package release. This reviewed version bump grants no tag or
publish authority; creating the annotated `v0.5.1` tag and publishing its exact
reviewed artifact remain separate, independently gated steps.
Consumers update shared, server, and client together: peers carrying protocol v2
and v3 reject each other during credential-free preflight. No registry token
belongs in this repository, package metadata, lockfiles, or a committed `.npmrc`;
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
