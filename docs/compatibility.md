# Protocol Compatibility

`@borgmcp/shared` versions the contracts shared by Borg MCP clients and server
implementations. Package versions and protocol generations are related but are
not interchangeable: a package release can add helpers without changing the
wire protocol.

| Package range | Protocol generation | Status |
| --- | --- | --- |
| `>=0.2.0 <0.3.0` | `1` | Versioned envelope, runtime codecs, and adapter conformance |

## Change Policy

Consumers must pin `^0.2.0`, which npm interprets as `>=0.2.0 <0.3.0`. During
the pre-1.0 series, a breaking envelope or wire-contract change requires a
minor release (`0.3.0`); additive compatible contracts and corrections use a
patch release (`0.2.x`). Consumers widen the minor range only after deliberate
compatibility review. A broad `<1.0.0` range is unsafe because pre-1.0 minor
versions may break the wire contract.

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

Model/provider selection is intentionally absent from the `0.2.x` coordination
contract. Agent CLIs own model configuration; Borg servers may expose the
separate advisory `reported_model` field for session observability, but clients
must not use it for routing, launch configuration, or authorization.
