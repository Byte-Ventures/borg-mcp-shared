# Protocol Compatibility

`borgmcp-shared` carries the wire contract shared by the Borg MCP client and
server. The client and server are a single clean-slate product: they ship and
update together, so the contract has no negotiation surface and no
backwards-compatibility machinery.

## Exact Protocol Tag

`PROTOCOL_VERSION` is the sole acceptance authority. Every envelope carries the
protocol tag, and each decoder fails closed on any value other than the exact
expected tag, with a clear static mismatch diagnostic and before any secret is
read. There is no capability negotiation, no supported-version list, no
compatibility matrix, and no package-range or version-range fallback. A peer
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
