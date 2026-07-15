# Retry-Safe Enrollment Contract

This document defines the data-only enrollment boundary shared by clients and
servers. It does not define offline operator commands, database transactions, or
keychain APIs, but implementations must preserve the security properties below.

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
request has no caller-controlled bootstrap flag, plan, role, grant, or cube.

## Secret-Free Responses

Ordinary enrollment returns only:

```json
{
  "purpose": "client",
  "client_id": "<canonical UUID>"
}
```

An ordinary enrollment creates no cube grant. It cannot infer access from
enrollment order, owner metadata, or a role label.

A successful purpose-bound bootstrap claim returns the stable identities created
by the one atomic claim:

```json
{
  "purpose": "bootstrap",
  "client_id": "<canonical UUID>",
  "cube_id": "<canonical UUID>",
  "human_seat_role_id": "<canonical UUID>",
  "default_worker_role_id": "<canonical UUID>",
  "access": "manage"
}
```

The response never contains, echoes, rotates, or recovers the client bearer,
invitation, retry key, recovery credential, or a session credential. `manage`
is the initial parent-client grant for that cube only; the role identities are
presentation/attachment metadata and do not confer authority.

## Retry Semantics

The server binds the consumed invitation to the canonical retry tuple and stores
only a keyed client credential digest. A retry is successful only when the retry key,
submitted credential proof, optional client name, invitation purpose, and
server-owned bootstrap plan fingerprint exactly match the original claim. It
returns the same non-secret response and performs no mutation.

A reused invitation with a different retry key, credential, client name,
purpose, epoch, or plan receives the same non-enumerating `AUTH_INVALID` class as
an absent, expired, revoked, malformed, or already-consumed invitation. It never
rotates credentials or creates another client, cube, role, or grant.

## Server Transaction Boundary

For a bootstrap invitation, the server capacity-preflights and atomically binds
the invitation/retry tuple, inserts the keyed client credential digest, creates exactly
one cube, creates exactly one human-seat role and one default worker role, grants
the client `manage` on that cube, and marks the invitation/plan claimed. Any
failure rolls back every mutation, including invitation consumption.

Ordinary invitation exchange atomically creates only the client and credential
digest. Explicit grants are a separate offline administrative operation. Network
enrollment and attach routes never create or widen grants.

## Conformance

`ENROLLMENT_RETRY_CONFORMANCE` covers exact retry stability plus retry-key,
credential, and client-name mismatches. `ENROLLMENT_REDACTION_CONFORMANCE` pins
diagnostic redaction for invitation and bearer values.
`ENROLLMENT_AUTHORITY_CONFORMANCE` distinguishes ordinary zero-grant enrollment
from the one cube-scoped bootstrap parent grant. The adapter conformance runner
requires client-generated credentials, a secret-free ordinary response, stable
exact retries, and uniform `AUTH_INVALID` mismatch behavior.
