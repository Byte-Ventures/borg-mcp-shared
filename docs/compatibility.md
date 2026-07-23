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
client and server adopt the new tag together in a coordinated release. There is
no mixed-version window in which an old client and a new server (or the reverse)
interoperate; incompatible peers fail closed rather than degrade.

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

Removing or reinterpreting an existing field is a protocol-breaking change even
when TypeScript permits it. Implementations must not infer compatibility from a
successful build alone — they must run the shared conformance suite against the
exact tag they implement.

## Coordinated Rollout

The rollout order is fail-closed:

1. Publish the reviewed `borgmcp-shared` registry artifact only after its
   separate tag and publication gates pass, under a version that has never been
   published with a different protocol tag.
2. Update the client and server releases to the reviewed registry range; Git
   dependencies are not an authorized release input.
3. Run the shared adapter conformance suite in both consumers before release.
4. Deploy client and server support together. A peer on the prior protocol tag
   and a peer on the new tag are incompatible; neither side falls back.

## Model/Provider Selection

Model/provider selection is intentionally absent from the coordination contract.
Agent CLIs own model configuration; Borg servers may expose the separate
advisory `reported_model` field for session observability, but clients must not
use it for routing, launch configuration, or authorization.

## Advisory Runtime Metadata

Protocol v3 defines one optional complete runtime-metadata report during attach
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
