# Protocol Compatibility

`borgmcp-shared` carries the wire contract shared by the Borg MCP client and
server. The client and server are a single clean-slate product: they ship and
update together, so the contract has no negotiation surface and no
backwards-compatibility machinery.

## Exact Protocol Tag

`PROTOCOL_VERSION` is the sole acceptance authority. The credential-free,
mutation-free `GET /api/protocol` preflight returns only the exact tag, and
`decodeProtocolTagPreflight` fails closed on any other tag, an extra field, or a
non-object body with a clear static mismatch diagnostic — so a client verifies
pinned TLS and the tag before it creates or sends any credential. Every
subsequent envelope also carries the tag and decodes it before any payload as
defense in depth. There is no capability negotiation, no supported-version list,
no compatibility matrix, and no package-range or version-range fallback. A peer
that presents a different tag is rejected — it is never adapted to.

## Change Policy

A wire-shape change is simply made: the protocol tag increments and both the
client and server adopt the new tag together in a coordinated release. During
the independently published rollout, a new client and server can temporarily
be the latest published packages without sharing the same tag; incompatible
peers fail closed rather than degrade. The publication window is a release
property, not a compatibility mode.

A wire-shape change must include:

1. A new or updated implementation-neutral conformance vector.
2. A documented client and server rollout order.
3. A package version bump so the new protocol tag never ships under a version
   whose already-published artifact carries a different tag.

Protocol v3 is carried by the published `borgmcp-shared@0.5.0` release. It
removes `session.expires_at` from attach responses: the exact session shape is
`{ "id": "<UUID>" }`. A v2 peer rejects v3 at preflight and envelope boundaries
before it decodes this response; a v3 peer likewise rejects v2. There is no
field-level fallback.

Published `borgmcp-shared@0.6.3` carries protocol v4. It adds strict
origin-or-local repository identity, separate cube and repository display names,
named built-in templates, and authoritative created-or-resolved readback. A v3
peer and a v4 peer reject each other before credentials or mutation.

Published `borgmcp-shared@0.6.4` carries protocol v5. It adds authenticated, read-only
`POST /api/repository-cubes/resolve` and separately confirmed, atomic
`PUT /api/repository-cubes/association` operations. The resolver returns an
explicit none or authoritative associated cube/template/role fields; association
requires an explicit cube ID and canonical repository identity. A v4 peer and a
v5 peer reject each other during credential-free preflight before credentials or
operation dispatch.

Published `borgmcp-shared@0.7.0` carries protocol v6. It adds
`local-model` to the closed cube-template acceptance set and bundles that named
Director/Shaper/Executor template. A v5 peer and a v6 peer reject each other
during credential-free preflight, before an older peer can reject the new
template later while decoding a cube-creation request.

Published `borgmcp-shared@0.7.1` carries protocol v7. It adds
manage-gated `DELETE /api/cubes/:cubeId` with an exact terminal response,
atomic cascade semantics, and `CUBE_DELETED`. Every connected deleted-cube
stream receives one strict protocol error envelope as `event: error` before
close. Former authorized parent and drone credentials receive
`410 CUBE_DELETED` for that cube, including after authority restart; callers
that were never authorized still receive non-enumerating `404 NOT_FOUND`.

Published `borgmcp-shared@0.9.0` retains protocol v7 and carries
the v2 invitation artifact: a canonical opaque token carrying the HTTPS
endpoint, CA SPKI SHA-256 pin, enrollment authority, secret, and integrity
binding. Decision write requests cap each `decision` and optional `rationale`
field at 512 UTF-8 bytes independently; response decoders retain longer
historical values. The strict codec rejects legacy or non-canonical invitation
forms before enrollment dispatch.

`borgmcp-shared@0.10.0` is published and immutable and carries protocol v8. It adds
manage-gated `DELETE /api/cubes/:cubeId/roles/:roleId` with integrity refusals
for active, default, mandatory, human-seat, and taxonomy-referenced roles. It
also adds the read-authorized `POST /api/cubes/:cubeId/role-rationale` lookup for
one named, plain-label section of a role description. A v7 peer and a v8 peer
reject each other during credential-free preflight before either new route is
dispatched.

The protocol v10 release is `borgmcp-shared@0.13.0`. It adds cube-scoped
immutable text documents, structured log citations, and bounded log-entry
advisories. A v9 peer and a v10 peer reject each other during credential-free
preflight before either peer sends credentials or dispatches an operation.

`borgmcp-shared@0.13.1` retains protocol v10 unchanged. It updates only the
shipped coordination templates so liveness evidence cannot authorize work
rerouting or reassignment without explicit human operator approval.

Removing or reinterpreting an existing field is a protocol-breaking change even
when TypeScript permits it. Implementations must not infer compatibility from a
successful build alone — they must run the shared conformance suite against the
exact tag they implement.

## Coordinated Rollout

The current workflows publish each package directly to npm's default `latest`
dist-tag. The least-bad order is therefore:

1. Publish the reviewed `borgmcp-shared` registry artifact only after its
   separate tag and publication gates pass, under a version that has never been
   published with a different protocol tag.
2. Update the server release to the reviewed exact shared version, then update
   the client release to the same exact shared version and matching server; Git
   dependencies are not an authorized release input.
3. Run the shared adapter conformance suite in both consumers before release.
4. Deploy client and server support together. A peer on the prior protocol tag
   and a peer on the new tag are incompatible; neither side falls back.

This order does not eliminate the publication window. Until the client release
finishes, `latest` can resolve to a new server and an older client, or the
reverse while the order advances. A user who installs both packages during that
window must install the matching coupled shared, server, and client versions
from the coordinated release instead of relying on `latest` for both peers.

## Model/Provider Selection

Model/provider selection is intentionally absent from the coordination contract.
Agent CLIs own model configuration; Borg servers may expose the separate
advisory `reported_model` field for session observability, but clients must not
use it for routing, launch configuration, or authorization.

## Advisory Runtime Metadata

Protocol v3 introduced one optional complete runtime-metadata report during attach
and one authenticated own-seat patch at
`PATCH /api/cubes/:cubeId/drones/self/metadata`. A complete report contains
`agent_kind`, `reported_model`, `working_repo_name`, and
`working_repo_origin`; each value may be explicitly `null`. In a patch, an
omitted field is unchanged, `null` clears the field, and a value replaces it.
Repository name and origin are one atomic pair.

Every identity response also carries required `runtime_metadata_reported`.
`false` means no complete report has been received, while `true` means the
client reported metadata even when every value is explicitly `null`. A valid
self-update patch sets the state to reported; clearing all four fields therefore
remains distinguishable from an omitted attach report.

The shared pure canonicalizer accepts public HTTPS and literal-`git` SSH/SCP
repository identities and returns a credential-free HTTPS identity. It performs
no DNS lookup or network request. It rejects local paths, IP and private hosts,
userinfo, non-default ports, queries, fragments, percent encoding, malformed
Unicode, terminal controls, and inconsistent repository pairs. Consumers use
the exported conformance corpus rather than maintaining independent parsers.

Runtime metadata is descriptive only. It cannot alter roles, grants,
authorization, wake or liveness state, timestamps, logs, routing, or model
execution. Mixed shared/server/client artifacts fail closed; there is no legacy
decoder, hosted fallback, or metadata-derived authority.
