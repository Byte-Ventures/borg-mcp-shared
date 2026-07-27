# Retry-Safe Enrollment and Repository Cube Contract

This document defines the data-only enrollment and cube-creation boundaries
shared by clients and servers. It does not define offline operator commands,
database transactions, or a client storage API, but implementations must
preserve the security properties below.

This contract replaced the server-generated bearer response used by the
published `borgmcp-shared@0.3.0` v1 baseline and shipped in the immutable
`0.4.0` clean-slate v2 release. The immutable `v0.4.1` verification artifact
failed its cross-platform SBOM audit and must never be published or rerun.
`borgmcp-shared@0.4.2`, `borgmcp-shared@0.4.3`, `borgmcp-shared@0.5.0`,
and `borgmcp-shared@0.5.1` are published and immutable. The accepted `0.5.1`
incident is bound to tag object `045268aa8873da330819860012ecaddb4bc2883c`, protected-main commit
`1981d7373e77f6edb4567872c1544bdbe2b1ef20`, attempt-1 run `29984423571`, and registry integrity
`sha512-XUJq+FjY/cbarU9V1dIWnhNYcqyURTiGb6KyIzg99gy5hk/fEs5ee/8X/qvp7pw1Rshqt2J6I3TVbwJdlde2tA==`.
`borgmcp-shared@0.6.0` was never published: annotated tag object
`90a1cf686a0ce32a7aef836b0b82a930191b9030` peels to protected-main commit
`fd69b08586481a60c88099dede8e4e066f73f2f2`; attempt-1 workflow run
`30054936226` failed in tests before build, packaging, authentication, or registry
mutation and must never be rerun or moved. `borgmcp-shared@0.6.1` and
`borgmcp-shared@0.6.2` and `borgmcp-shared@0.6.3` are published and immutable.
This source now identifies the reviewed, unpublished `0.6.4`
repository-association hotfix candidate. The version bump grants no tag or
publication authority: creating `v0.6.4` and
publishing the reviewed artifact remain separate, independently gated steps.
There is no compatibility path that returns a bearer from the server.

A client verifies the credential-free `GET /api/protocol` tag preflight before
it creates or sends any enrollment secret; a peer that presents a different
protocol tag is rejected outright. The exact protocol tag is the sole acceptance
authority, so there is no capability a server advertises or a client negotiates
for this contract. The enrollment
response still carries the enrolled principal's `server_capabilities` (owner
enrollment grants `['create_cube']`; ordinary enrollment grants none) — that is
an authorization fact about the principal, not a negotiated protocol capability.

## Client Preconditions

Before network I/O, the client generates:

- a cryptographically random 256-bit client bearer, encoded as canonical
  unpadded base64url; and
- a canonical UUID retry key.

Before sending the request, the client persists both values in its single local
seat-record file with mode `0600`, using an atomic replacement under the store's
cross-process lock. The pending record is operation-scoped and cannot be loaded
as an active seat. The client retains and reuses the exact pending tuple after an
ambiguous timeout or connection loss. The wire contract never permits
URL/argv/environment transport or diagnostic output for these secrets.

## Exchange Request

`POST /api/enrollment/exchange` receives one strict payload inside the protocol
envelope:

```json
{
  "invitation": "<opaque invitation>",
  "retry_key": "00000000-0000-4000-8000-000000000101",
  "client_credential": "<43-character canonical base64url>",
  "client_name": "optional presentation label"
}
```

`client_name` is bounded presentation data. All other fields are required.
Unknown fields, weak credentials, noncanonical UUIDs, controls, and ambiguous
aliases fail closed. Invitation purpose is server-owned persisted state; the
request has no caller-controlled owner flag, plan, role, grant, or cube.

## Secret-Free Responses

Ordinary enrollment returns only:

```json
{
  "purpose": "client",
  "client_id": "<canonical UUID>",
  "server_capabilities": []
}
```

An ordinary enrollment creates no cube grant. It cannot infer access from
enrollment order, owner metadata, or a role label.

A successful purpose-bound owner enrollment returns only the narrow server
capability persisted for that client:

```json
{
  "purpose": "owner",
  "client_id": "<canonical UUID>",
  "server_capabilities": ["create_cube"]
}
```

The response never contains, echoes, rotates, or recovers the client bearer,
invitation, retry key, recovery credential, or a session credential. Owner
enrollment creates zero cubes, roles, and cube grants. `create_cube` authorizes
only authenticated cube creation; it does not reveal or grant access to any
existing cube and is never inferred from enrollment order, owner metadata, or a
role label.

## Retry Semantics

The server binds the consumed invitation to the canonical retry tuple and stores
only a keyed client credential digest. A retry is successful only when the retry key,
submitted credential proof, optional client name, invitation purpose, and
server-owned owner-claim epoch exactly match the original enrollment. It
returns the same non-secret response and performs no mutation.

A reused invitation with a different retry key, credential, client name,
purpose, epoch, or plan receives the same non-enumerating `AUTH_INVALID` class as
an absent, expired, revoked, malformed, or already-consumed invitation. It never
rotates credentials or creates another client, capability, cube, role, or grant.

## Server Transaction Boundary

For an owner invitation, the server capacity-preflights and atomically binds the
invitation/retry tuple, inserts the keyed client credential digest, persists the
`create_cube` capability, and marks the invitation/owner epoch claimed. It
creates no cube, role, or cube grant. Any failure rolls back every mutation,
including invitation consumption.

Ordinary invitation exchange atomically creates only the client and credential
digest. Explicit grants are a separate offline administrative operation. Network
enrollment and attach routes never create or widen grants.

## Cube Creation

Introduced under protocol v4 and retained in v5, `POST /api/cubes` requires an
active parent-client credential
with the persisted `create_cube` server capability. Ordinary clients, revoked
clients, and drone sessions cannot use it. Its strict payload is:

```json
{
  "retry_key": "00000000-0000-4000-8000-000000000201",
  "name": "My Repository Cube",
  "working_repo_name": "repository-display-name",
  "repository": {
    "kind": "origin",
    "value": "https://github.com/owner/repository"
  },
  "template": "software-dev"
}
```

The client persists the pending retry tuple before network I/O and reuses it
after ambiguous transport failure. `name` is the bounded user-selected cube
name. `working_repo_name` is derived repository display metadata and does not
identify or authorize the repository. `repository` is either an exact canonical
public origin or a client-generated opaque local UUID. `template` accepts
`software-dev`, `starter`, `local-model`, or the compatible legacy `default`
seed. The request
cannot supply cube or role IDs, an owner, access, grant target, capability,
arbitrary template data, local paths, raw origins, modules, commands, or
repository credentials.

The server binds `(authenticated client, retry_key)` to the exact cube name,
repository identity, and template. A successful transaction atomically creates
one cube, the selected template directive, roles and flags, message taxonomy,
and exactly one creator `manage` grant. The legacy `default` input retains its
empty directive, platform Coordinator, default Builder, and no taxonomy. The
authoritative response is:

```json
{
  "result": "created",
  "cube_id": "<canonical UUID>",
  "name": "My Repository Cube",
  "working_repo_name": "repository-display-name",
  "repository": {
    "kind": "origin",
    "value": "https://github.com/owner/repository"
  },
  "template": "software-dev",
  "human_seat_role_id": "<canonical UUID>",
  "default_worker_role_id": "<canonical UUID>",
  "access": "manage"
}
```

An exact retry returns `result: "resolved"` with the stored authoritative fields
and no mutation. A fresh retry key for the same creator-scoped repository
association also resolves that stored cube, name, repository display, and
template without mutation. Changed `working_repo_name` input does not overwrite
stored display metadata. Reusing a bound retry key with a different cube name,
repository identity, or template returns non-enumerating HTTP `409`
`INVALID_INPUT` and creates nothing. A fresh retry for a different, unassociated
repository may create another cube, subject to implementation quotas. `owner_id`
and role labels remain metadata; cube access derives only from the explicit
cube-scoped grant.

## Existing Repository Cube Resolution and Association

Repository lookup and adoption are separate authenticated operations. Before
name discovery or any prompt, a client sends the canonical `repository` identity
and bounded `working_repo_name` to the read-only
`POST /api/repository-cubes/resolve` operation. It returns exactly
`{ "result": "none" }` when no association exists for that authenticated client,
or the stored authoritative cube name, template, repository display, human-seat
role ID, default-worker role ID, and `manage` access with `result: "resolved"`.
The resolver never mutates state or infers an association from a cube name.
Associations are scoped to the authenticated client. Cross-client bindings never
produce a conflict or existence signal. If a same-client association points to a
cube for which the caller no longer has `manage` access, read-only resolution
returns `none` rather than exposing the binding.

After separate user confirmation, `PUT /api/repository-cubes/association`
accepts an explicit canonical cube UUID plus the same repository identity and
display fields. The server requires authenticated `manage` authority for that
cube and atomically persists the association before returning the same
authoritative resolved shape. Repeating the same cube/repository binding is
idempotent. A repository already bound to another cube returns HTTP `409`
`REPOSITORY_ALREADY_ASSOCIATED`; a cube already bound to another repository
returns HTTP `409` `CUBE_ALREADY_ASSOCIATED`. A legacy cube whose authoritative
human-seat or default-worker roles are invalid returns HTTP `409` `INVALID_INPUT`.
All three outcomes perform zero mutation and use static, non-enumerating
diagnostics: neither `message` nor `details` may name or echo a conflicting cube
ID or repository identity, regardless of the caller's access. An inaccessible
target cube, or a same-client repository binding whose cube is no longer
accessible, returns HTTP `403` `ACCESS_DENIED` without distinguishing the hidden
state. Names are discovery and display values only. Implementations must not
silently infer or backfill an
association, report success after a client-local write alone, or overload cube
creation as the read-only preflight.

## Conformance

`ENROLLMENT_RETRY_CONFORMANCE` covers exact retry stability plus retry-key,
credential, and client-name mismatches. `ENROLLMENT_REDACTION_CONFORMANCE` pins
diagnostic redaction for invitation, bearer, and contextual retry-key values
while preserving unrelated public UUIDs. `ENROLLMENT_AUTHORITY_CONFORMANCE`
distinguishes ordinary zero-authority enrollment from owner `create_cube`
authority with zero initial cube state. The executable adapter runner drives
every retry vector, observes client/capability/cube/role/grant counts, verifies
secret-free errors, and proves authorized idempotent cube creation. Hostile
reference adapters demonstrate that each retry, authority, and idempotency
violation fails conformance.

`CREATE_CUBE_RETRY_CONFORMANCE` independently pins exact resolution, stored
display readback, and mismatch rejection for cube name, repository kind/value,
and template. `CREATE_CUBE_ASSOCIATION_CONFORMANCE` distinguishes no-mutation
resolution of an existing repository association from creation for a different,
unassociated repository. `RESOLVE_REPOSITORY_CUBE_CONFORMANCE` pins explicit
none and authoritative no-mutation readback. `ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE`,
`REPOSITORY_CUBE_PERMISSION_CONFORMANCE`, and
`REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE` pin explicit-ID idempotency,
both conflict directions, non-enumerating diagnostics, manage authorization,
authoritative role validation, and zero mutation on rejection. The
adapter runner executes the complete association boundary against each host.
