# Retry-Safe Enrollment and Cube Creation Contract

This document defines the data-only enrollment and cube-creation boundaries
shared by clients and servers. It does not define offline operator commands,
database transactions, or keychain APIs, but implementations must preserve the
security properties below.

This contract replaces the server-generated bearer response used by
`borgmcp-shared@0.2.2`. It is an unreleased breaking wire change and requires a
coordinated client/server migration and an authorized package version before
publication. There is no compatibility path that returns a bearer from the
server.

Servers implementing this contract advertise the required
`auth.retry-safe-enrollment` capability. Negotiation fails closed when it is
absent.

## Client Preconditions

Before network I/O, the client generates:

- a cryptographically random 256-bit client bearer, encoded as canonical
  unpadded base64url; and
- a canonical UUID retry key.

The client persists both values as a pending enrollment in the operating-system
keychain before sending the request. It retains and reuses the exact pending
tuple after an ambiguous timeout or connection loss. The wire contract never
permits a file fallback, URL/argv/environment transport, or diagnostic output
for these secrets.

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

`POST /api/cubes` requires an active parent-client credential with the persisted
`create_cube` server capability. Ordinary clients, revoked clients, and drone
sessions cannot use it. Its strict payload is:

```json
{
  "retry_key": "00000000-0000-4000-8000-000000000201",
  "name": "repository presentation name",
  "template": "default"
}
```

The client persists the pending retry tuple before network I/O and reuses it
after ambiguous transport failure. `name` is bounded presentation data and
`template` selects allowlisted, server-owned inert data. The request cannot
supply cube or role IDs, an owner, access, grant target, capability, arbitrary
template data, paths, URLs, modules, commands, or repository credentials.

The server binds `(authenticated client, retry_key)` to the exact canonical name
and template. A successful transaction atomically creates one cube, exactly one
human-seat role, exactly one default worker role, and exactly one creator
`manage` grant. It returns:

```json
{
  "cube_id": "<canonical UUID>",
  "human_seat_role_id": "<canonical UUID>",
  "default_worker_role_id": "<canonical UUID>",
  "access": "manage"
}
```

An exact retry returns that stable response without mutation. Reusing the same
retry key with a different name or template returns non-enumerating HTTP `409`
`INVALID_INPUT` and creates nothing. A fresh retry key may create another cube,
subject to implementation quotas. `owner_id` and role labels remain metadata;
cube access derives only from the explicit cube-scoped grant.

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
