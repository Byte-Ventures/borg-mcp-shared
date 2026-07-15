# Protocol Compatibility

`borgmcp-shared` versions the contracts shared by Borg MCP clients and server
implementations. Package versions and protocol generations are related but are
not interchangeable: a package release can add helpers without changing the
wire protocol.

| Package range | Protocol generation | Status |
| --- | --- | --- |
| `>=0.3.0 <0.4.0` | `1` | Retry-safe owner enrollment and idempotent multi-cube creation |
| `>=0.2.0 <0.3.0` | `1` | Legacy server-generated enrollment credential response |

## Change Policy

Consumers implementing the current contract must pin `^0.3.0`, which npm
interprets as `>=0.3.0 <0.4.0`. During the pre-1.0 series, a breaking envelope
or wire-contract change requires a minor release; additive compatible contracts
and corrections use a patch release within that minor. Consumers widen the
minor range only after deliberate compatibility review. A broad `<1.0.0` range
is unsafe because pre-1.0 minor
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
successful build alone. Because both package ranges use protocol generation `1`,
implementations must also check the peer package range and required capabilities,
then run the shared conformance suite.

## 0.3.0 Enrollment Migration

The source contract for purpose-bound owner enrollment now uses a
client-generated credential and retry key and returns only the stable client ID
plus `create_cube`; ordinary enrollment returns no server capability. Setup and
enrollment create zero cubes. The separate authenticated, idempotent
`POST /api/cubes` creates the selected cube template and creator grant. These
shapes replace the server-generated credential response in `0.2.2` and are
therefore a breaking wire change selected for `0.3.0`. They must not be silently
accepted as a compatibility path. Client and server consumers must migrate
together.

The rollout order is fail-closed:

1. Publish the reviewed `borgmcp-shared@0.3.0` registry artifact only after its
   separate tag and publication gates pass.
2. Update the first client and server releases to the reviewed registry range
   `^0.3.0`; Git dependencies are not an authorized release input.
3. Run the shared adapter conformance suite in both consumers before release.
4. Deploy client and server support together. A `0.2.x` enrollment peer and a
   `0.3.x` enrollment peer are incompatible; neither side may fall back to the
   legacy server-generated credential response.

There is no mixed-version enrollment migration window because the affected
client and server surfaces have not been publicly released. Existing
`borgmcp-shared@0.2.2` coordination consumers remain on `^0.2.0` until they
deliberately adopt the new enrollment contract.

Model/provider selection is intentionally absent from the `0.3.x` coordination
contract. Agent CLIs own model configuration; Borg servers may expose the
separate advisory `reported_model` field for session observability, but clients
must not use it for routing, launch configuration, or authorization.
