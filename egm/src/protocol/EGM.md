# src/protocol

Contract for `src/protocol` (stored outside `src/` because `src/` is packed to npm).

## Overview

This directory defines the wire contract for protocol version `'15'`:

- the HTTP route table
- limit ceilings
- the `ErrorCode` enum
- strict decoders for envelopes and payloads in these areas: enrollment, cubes, repository association, attach and attachment reconciliation, log and coordination, documents, and SSE frames.

Decoders throw `ProtocolContractError`. [`index.ts`](../../../src/protocol/index.ts) re-exports every file in the directory, plus the type `BroadcastHwm`. The package publishes this directory as the `./protocol` subpath export.

## Interface

- [`version.ts`](../../../src/protocol/version.ts): `PROTOCOL_VERSION = '15'`, `ProtocolVersion`.
- [`errors.ts`](../../../src/protocol/errors.ts): the `ErrorCode` string enum, with 29 members. Examples: `AUTH_MISSING`, `AUTH_INVALID`, `ACCESS_DENIED`, `INVALID_INPUT`, `NOT_FOUND`, `POST_ID_CONFLICT`, `ROLE_*`, `DOCUMENT_*`, `CUBE_DELETED`, `DRONE_EVICTED`, `UNSUPPORTED_PROTOCOL_VERSION`, `CURSOR_EXPIRED`, `SESSION_REVOKED`, `SESSION_REJECTED`, `ATTACHMENT_RETIRED`, `ATTACHMENT_FINALIZED`.
- [`contract.ts`](../../../src/protocol/contract.ts):
  - `PROTOCOL_HTTP_CONTRACT`, the HTTP route table. It is not a complete list of routes: it has no log, ack, decision, roster or stream routes.
    - Service:
      - `GET /healthz` (204, no auth, no body)
      - `GET /api/protocol` (200, no auth)
      - `POST /api/enrollment/exchange` (201, invitation auth)
    - Cubes and roles:
      - `POST /api/cubes` (201)
      - `DELETE /api/cubes/:cubeId`
      - `DELETE /api/cubes/:cubeId/roles/:roleId`
      - `POST /api/cubes/:cubeId/role-rationale`
    - Documents:
      - `PUT /api/cubes/:cubeId/documents` (201)
      - `GET /api/cubes/:cubeId/documents`
      - `GET /api/cubes/:cubeId/documents/:documentId`
      - `DELETE /api/cubes/:cubeId/documents/:documentId`
    - Repository association:
      - `POST /api/repository-cubes/resolve`
      - `PUT /api/repository-cubes/association`
    - Attachment:
      - `POST /api/client/attach`
      - `POST /api/client/attach/reconcile` (client auth)
    - Drones:
      - `PATCH /api/cubes/:cubeId/drones/:droneId`
      - `DELETE /api/cubes/:cubeId/drones/:droneId`
      - `PATCH /api/cubes/:cubeId/drones/self/metadata` (drone-session auth)
    - Status codes:
      - 401: authentication and session errors
      - 409: attachment state conflicts
      - 410: expired cursor, deleted cube, evicted drone
      - 413: content too large
      - 426: unsupported protocol version
  - Constants:
    - `PROTOCOL_LIMIT_CEILINGS`: `max_request_bytes` 10 MiB, `max_log_message_bytes` 65,536, `max_read_page_size` 500, `max_replay_page_size` 1000
    - `SHARED_PACKAGE_VERSION = '3.0.0'` (a release-identity carrier)
    - `CUBE_TEMPLATES`
  - Envelope functions:
    - `createProtocolEnvelope`
    - `decodeProtocolEnvelope`, `decodeProtocolTagPreflight`, `decodeProtocolErrorEnvelope`
    - `encodeInvitationArtifact`, `decodeInvitationArtifact`
  - Payload decoders for enrollment, cubes, repository-cube association, attach and runtime metadata.
  - Primitive helpers: `decodeUuid`, `decodeLogCursor`, `compareLogCursor`, `redactProtocolDiagnostic`, `utf8ByteLength`.
  - Error class: `ProtocolContractError`.
- [`attachment.ts`](../../../src/protocol/attachment.ts):
  - `ATTACHMENT_RECEIPT_DOMAIN`
  - `deriveAttachmentReceipt` (async)
  - The `decodeReconcileAttachment*` decoders
- [`coordination.ts`](../../../src/protocol/coordination.ts):
  - Decoders for log reads, entry queries, ack status, drone reassign and evict, role delete, role rationale and decisions
  - `ROLE_IN_USE_DELETE_MESSAGE`
- [`documents.ts`](../../../src/protocol/documents.ts):
  - `DOCUMENT_CONTENT_TYPES` and the default size constants
  - Decoders for document metadata and citations, and for put, get, list and remove requests and results
- [`sse.ts`](../../../src/protocol/sse.ts):
  - `SSE_LIMITS`
  - The `StreamEvent` union: `log`, `ack`, `claim`, `error`, `heartbeat`, `bookmark`, `unknown`
  - `encodeSseEvent`, `decodeSseFrames`, `decodeEnrichedStreamEntry`
- [`types.ts`](../../../src/protocol/types.ts): type-only wire types, such as `Cube`, `Role`, `Drone`, `ActivityLogEntry`, `EnrichedStreamEntry` and `AppendLogRequest`.

## Invariants

- The protocol tag must exactly equal `PROTOCOL_VERSION`. Any other tag fails with `UNSUPPORTED_PROTOCOL_VERSION`. There is no version negotiation, and the decoder checks the tag before it decodes the payload (`decodeProtocolEnvelope`).
- Most decoders reject unknown fields and missing required fields (`exactKeys`). There are exceptions:
  - `decodeDroneRuntimeMetadataState` and `decodeWhoAmIRuntimeMetadataState` select the runtime-metadata fields from a larger object and ignore all other keys.
  - Some fields are optional. For example, `decodeAckLogRequest` sets a missing `kind` to `ack`.
- String bounds are measured in UTF-8 bytes. The exception is the document `title`: it is at most 480 bytes and also at most 120 code points.
- Decoders never echo session credentials. The `decodeReconcileAttachment*` decoders in `attachment.ts` collapse every error to one generic message (`safe`). The exception is `UNSUPPORTED_PROTOCOL_VERSION`, which they keep as a separate error. `decodeAttachRequestEnvelope` does not collapse errors: it throws the normal per-field errors and paths, and it checks the protocol tag before the payload.
- In enrollment responses, `server_capabilities` is `[]` for a client and `['create_cube']` for an owner (`decodeEnrollmentExchangeResponse`).
- `redactProtocolDiagnostic` redacts retry keys, bearer tokens and runs of 43 or more base64url characters. It also escapes control characters.
- In a read-log result, entries are in strictly ascending `(created_at, id)` order, and the cursor equals the last entry (`decodeReadLogResult`).
- Document lists exclude removed documents. A document's `size_bytes` must equal the UTF-8 byte length of its content.
- SSE frame decoding (`decodeSseFrames`):
  - Input is at most 1 MiB and at most 1000 frames.
  - The decoder rejects a duplicate `event` or `id` field and any unknown field. Repeated `data` lines are accepted and joined with `\n`.
  - A log event's `id` must equal its cursor and its entry's `(id, created_at)`.

## Side Effects

- `deriveAttachmentReceipt` uses `globalThis.crypto.subtle.digest('SHA-256')`.
- Invitation endpoint parsing uses `globalThis.URL`.
- `sse.ts` computes `MAX_LOG_DATA_BYTES` at module load. This uses CPU only.
- No file reads `process.env`. The `*_ENV` constants only export environment variable names.

## Verification

- Run: `npm test`
- Run: `npm run check`
