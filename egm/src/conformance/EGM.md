# src/conformance

Contract for `src/conformance` (stored outside `src/` because `src/` is packed to npm).

## Overview

This directory holds portable behavioral conformance for every borg client and server. It has two parts:

- [`index.ts`](../../../src/conformance/index.ts) defines deterministic, implementation-neutral `*_CONFORMANCE` vectors.
- [`adapter.ts`](../../../src/conformance/adapter.ts) defines a harness. `runAdapterConformance` runs 35 fixtures against any implementation through an adapter. An adapter is a `ConformanceEnvironment` with test-only admin controls and raw HTTP-shaped operations.

Wire-visible behavior changes need new vectors here (AGENTS.md).

## Interface

- `runAdapterConformance(environment, options = {})` returns `Promise<AdapterConformanceReport>` with these fields:
  - `ok`
  - `results`: an array of `{id, ok, skipped?, observations, error?}`
  - `normalizedTranscript`: `{id, observations}` for each fixture that was not skipped. The transcript is stable and contains no identifiers, so you can compare it across adapters.
- `AdapterConformanceOptions` has two options:
  - `streamDeadlineMs` (default `5_000`)
  - `pendingProbeMs` (default `25`)
- `ConformanceEnvironment` is `{admin: ConformanceAdmin, operations: ConformanceOperations}`.
- `ConformanceAdmin` holds test-only controls:
  - `reset`, `createPrincipal`, `createCube`
  - `grantCube` (`read`, `write` or `manage`; defaults to `manage`), `revokeCubeGrant`
  - `createRole`, `seedEntryQueryIds`, `createDrone`
  - `issueManagedDroneSession`, `revokeManagedDroneSession`, `issueDroneSession`
  - `grantCreateCubeCapability`, `issueSingleUseInvitation`, `prepareRepositoryCube`, `revokePrincipal`
  - `expireCursor`, `armReplayTransition` (returns a `ConformanceReplayBarrier`)
- `ConformanceOperations` holds raw operations. Each returns `ConformanceHttpResponse{status, body}`:
  - Service: `health`, `protocol`, `enroll`
  - Cubes: `createCube`, `deleteCube`, `updateCube`, `patchTaxonomy`
  - Documents: `putDocument`, `getDocument`, `listDocuments`, `removeDocument`
  - Repository association: `resolveRepositoryCube`, `associateRepositoryCube`
  - Attachment: `attach`, `reconcileAttachment`, `selfMetadataUpdate`
  - Log: `append`, `appendRaw`, `read`, `entryQuery`, `ack`, `ackStatus`
  - Decisions: `recordDecision`, `listDecisions`
  - Drones and roles: `listDrones`, `reassignDrone`, `evictDrone`, `createRole`, `deleteRole`, `roleRationale`
  - Streams: `openStream` returns a `ConformanceStreamResponse` whose stream yields raw SSE text chunks.
- `ADAPTER_CONFORMANCE_FIXTURES` and `AdapterConformanceFixtureId` list the 35 fixtures by area:
  - Service: `http.unauthenticated-liveness`, `protocol.credential-free-preflight`
  - Enrollment: `enrollment.invitation-artifact`, `enrollment.retry-authority`
  - Repository and documents: `repository.explicit-association`, `documents.lifecycle`
  - Security: `security.adapter-boundary-injection`, `security.oversize-request`, `security.cross-cube-isolation`, `security.drone-management-authorization`, `security.manage-access-matrix`, `security.cross-cube-drone-management`, `security.active-stream-revocation`
  - Log, stream and cursor: `log.append-idempotency`, `log.mandatory-addressing`, `log.entry-query`, `log.read-cursor-tuple`, `sse.replay-live-transition`, `cursor.explicit-expiry`
  - Acks and decisions: `acks.idempotent`, `acks.status-query`, `decisions.topic-supersession`
  - Drones and roles: `drones.reassign-invariants`, `drones.evict-terminal-signal`, `roles.delete-contract`, `roles.rationale-contract`
  - Runtime metadata: `metadata.attach-report`, `metadata.self-heal-patch`, `security.metadata-invalid-atomic`, `security.metadata-own-seat`, `security.metadata-cross-cube-isolation`, `security.metadata-noninterference`, `security.metadata-secret-non-echo`
  - Cube deletion and attachment: `cubes.delete-terminal-cascade`, `attachment.reconciliation`
- Vector constants in `index.ts`. Only five use the generic shape `ConformanceVector<Input, Output>`: `BROADCAST_HWM_CONFORMANCE`, `DRONE_ADDRESS_CONFORMANCE`, `INVITATION_ARTIFACT_CONFORMANCE`, `ENROLLMENT_REDACTION_CONFORMANCE` and `ATTACHMENT_RECEIPT_CONFORMANCE`. Most others use their own `*ConformanceVector` interface. `ROLE_SECTION_ROUND_TRIP_CONFORMANCE` is `readonly string[]`. `DOCUMENT_CONFORMANCE`, `REPOSITORY_CUBE_PERMISSION_CONFORMANCE`, `REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE` and `ENROLLMENT_AUTHORITY_CONFORMANCE` are untyped `as const` literals.
  - Documents: `DOCUMENT_CONFORMANCE`
  - Ordering and addressing: `BROADCAST_HWM_CONFORMANCE`, `DRONE_ADDRESS_CONFORMANCE`
  - Log append: `APPEND_LOG_IDEMPOTENCY_CONFORMANCE`, `APPEND_LOG_REQUEST_CONFORMANCE`, `APPEND_LOG_RESULT_CONFORMANCE`
  - Role text: `ROLE_SECTION_ROUND_TRIP_CONFORMANCE`
  - Enrollment: `INVITATION_ARTIFACT_CONFORMANCE`, `ENROLLMENT_RETRY_CONFORMANCE`, `ENROLLMENT_AUTHORITY_CONFORMANCE`, `ENROLLMENT_REDACTION_CONFORMANCE`
  - Cube creation and deletion: `CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE`, `CREATE_CUBE_RETRY_CONFORMANCE`, `CREATE_CUBE_ASSOCIATION_CONFORMANCE`, `DELETE_CUBE_CONFORMANCE`
  - Repository association: `RESOLVE_REPOSITORY_CUBE_CONFORMANCE`, `ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE`, `REPOSITORY_CUBE_PERMISSION_CONFORMANCE`, `REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE`
  - Attachment: `ATTACHMENT_RECEIPT_CONFORMANCE`, `ATTACH_SESSION_CONFORMANCE`
  - Roles: `ROLE_DELETE_CONFORMANCE`, `ROLE_RATIONALE_CONFORMANCE`
  - Log queries: `ACK_STATUS_CONFORMANCE`, `ENTRY_QUERY_CONFORMANCE`
  - Runtime metadata: `RUNTIME_METADATA_REPOSITORY_CONFORMANCE`

## Invariants

Runner behavior (`adapter.ts`):

- `streamDeadlineMs` and `pendingProbeMs` must be positive. If either is not, the runner throws before it runs any fixture.
- If a fixture throws, the runner records it as `ok: false` and continues the run.
- If a prerequisite fails, the runner skips every fixture that depends on it and records each one as `skipped: true, ok: false` (`FIXTURE_PREREQUISITES`). The prerequisites are `shared.enrolled-principals` and `shared.metadata-baseline`.
- The `ConformanceAdmin` controls are test-only. Production request handlers must never expose them.

Behavior the fixtures and vectors require from an implementation:

- Error bodies never contain secrets: retry keys, invitations, client credentials or session tokens (`expectSecretFreeError`).
- Access errors:
  - A caller with no grant, or any request for a foreign or unknown cube, gets `404 NOT_FOUND`, so the cube cannot be discovered.
  - Repository association is an exception. An association with a cube that the caller has no grant for gets `403 ACCESS_DENIED` and changes no state (`REPOSITORY_CUBE_PERMISSION_CONFORMANCE`). Read-only resolution of a repository bound to such a cube returns `none`.
  - A caller with an insufficient grant gets `403 ACCESS_DENIED`.
  - Denied operations do not change any state.
- `post_id` idempotency is scoped to the author:
  - An exact retry is deduplicated.
  - A retry that changes the message, audience or recipient set gets `409 POST_ID_CONFLICT`.
  - A retry by a different author creates a new entry.
- Log reads are ordered by the `(created_at, id)` tuple. SSE replay starts strictly after the cursor, loses nothing at the replay/live boundary, emits a `bookmark` event with `replay_complete`, and never sends an entry twice.
- An expired cursor gets `410 CURSOR_EXPIRED` for both `read` and `openStream`.
- Eviction and cube deletion are terminal:
  - Old credentials get `410 DRONE_EVICTED` or `410 CUBE_DELETED`.
  - Each open stream receives one `CUBE_DELETED` error frame and then closes.
- Attachment reconciliation:
  - `finalized` and `retired` are terminal and mutually exclusive (`409 ATTACHMENT_FINALIZED` or `409 ATTACHMENT_RETIRED`).
  - A retry reuses the existing session and never creates a duplicate drone.
- The cube template set is closed: `software-dev`, `starter` and `local-model` (`CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE`).

## Side Effects

- `runAdapterConformance` calls `environment.admin.reset()` several times, which wipes the system under test. It then creates principals, cubes, roles, drones, log entries, documents and decisions through the adapter.
- `adapter.ts` uses `globalThis.setTimeout` and `globalThis.clearTimeout` for deadlines (`within`, `delay`).
- `index.ts` calls `encodeInvitationArtifact` at module load to build its fixture tokens. It does no I/O.

## Verification

- Run: `npm test`
- Run: `npm run check`
