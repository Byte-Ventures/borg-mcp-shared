# Protocol Compatibility

`borgmcp-shared` versions the contracts shared by Borg MCP clients and server
implementations. Package versions and protocol generations are related but are
not interchangeable: a package release can add helpers without changing the
wire protocol.

| Package range | Protocol generation | Status |
| --- | --- | --- |
| `>=0.1.0 <1.0.0` | `1` | Initial hosted and self-hosted server contract |

## Change Policy

Additive TypeScript helpers and conformance vectors require a package minor
version while the package is pre-1.0. A correction that does not change public
behavior can use a patch version.

A wire-shape change must include all of the following:

1. A new or updated implementation-neutral conformance vector.
2. A documented client and server rollout order.
3. A compatibility entry that identifies the affected package and protocol
   versions.
4. A migration window when older deployed clients or servers can still be in
   use.

Removing or reinterpreting an existing field is a protocol-breaking change even
when TypeScript permits it. Implementations must not infer compatibility from a
successful build alone; they should check the declared protocol generation and
run the shared conformance suite.
