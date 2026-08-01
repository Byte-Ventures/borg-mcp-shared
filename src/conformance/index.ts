import type { BroadcastHwm } from '../log-stream-hwm.js';
import type {
  AttachResponse,
  AssociateRepositoryCubeRequest,
  CreateCubeRequest,
  DeleteCubeRequest,
  EnrollmentExchangeRequest,
  ResolveRepositoryCubeRequest,
} from '../protocol/contract.js';
import {
  encodeInvitationArtifact,
  type InvitationArtifact,
} from '../protocol/contract.js';
import type { EnrichedStreamEntry } from '../protocol/types.js';

export * from './adapter.js';

/** A portable input/output vector that can be consumed by any test runner. */
export interface ConformanceVector<Input, Output> {
  name: string;
  input: Input;
  expected: Output;
}

export interface BroadcastHwmComparisonInput {
  a: BroadcastHwm;
  b: BroadcastHwm;
}

export const BROADCAST_HWM_CONFORMANCE: readonly ConformanceVector<
  BroadcastHwmComparisonInput,
  -1 | 0 | 1
>[] = [
  {
    name: 'orders by timestamp',
    input: {
      a: { id: 'z', created_at: '2026-05-29T09:59:59.000Z' },
      b: { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
    },
    expected: -1,
  },
  {
    name: 'breaks equal-timestamp ties by id',
    input: {
      a: { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
      b: { id: 'b', created_at: '2026-05-29T10:00:00.000Z' },
    },
    expected: -1,
  },
  {
    name: 'compares identical tuples as equal',
    input: {
      a: { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
      b: { id: 'a', created_at: '2026-05-29T10:00:00.000Z' },
    },
    expected: 0,
  },
  {
    name: 'falls back to raw timestamp ordering for invalid dates',
    input: {
      a: { id: 'a', created_at: 'not-a-date-a' },
      b: { id: 'a', created_at: 'not-a-date-b' },
    },
    expected: -1,
  },
];

export const DRONE_ADDRESS_CONFORMANCE: readonly ConformanceVector<string, string>[] = [
  {
    name: 'formats the stable lowercase eight-character id prefix',
    input: '3336CDE1-a76e-4e89-8bc2-77c149bb6a74',
    expected: '`id:3336cde1`',
  },
];

const APPEND_LOG_ENTRY: EnrichedStreamEntry = {
  id: '00000000-0000-4000-8000-000000000201',
  cube_id: '00000000-0000-4000-8000-000000000202',
  drone_id: '00000000-0000-4000-8000-000000000203',
  message: 'REVIEW-READY: example',
  visibility: 'direct',
  created_at: '2026-01-01T00:00:00.000Z',
  drone_label: 'one-of-one-builder',
  role_name: 'Builder',
  recipient_drone_ids: ['00000000-0000-4000-8000-000000000204'],
};

const APPEND_LOG_ROUTING = {
  class: 'review',
  recipients: ['one-of-one-reviewer'],
  fellOpen: false,
  message: 'Routing applied.',
} as const;

export interface AppendLogResultConformanceVector {
  name: string;
  response: unknown;
  accepts: boolean;
}

/** Runtime response vectors keep the append-log decoder aligned with its public type. */
export const APPEND_LOG_RESULT_CONFORMANCE: readonly AppendLogResultConformanceVector[] = [
  {
    name: 'accepts a response without optional routing metadata',
    response: { entry: APPEND_LOG_ENTRY },
    accepts: true,
  },
  {
    name: 'accepts exact routing metadata and unreachable recipients',
    response: {
      entry: APPEND_LOG_ENTRY,
      routing: APPEND_LOG_ROUTING,
      unreachableRecipients: [{ id: 'missing-reviewer', label: 'Missing Reviewer' }],
    },
    accepts: true,
  },
  {
    name: 'accepts a null routing echo and an empty unreachable-recipient list',
    response: { entry: APPEND_LOG_ENTRY, routing: null, unreachableRecipients: [] },
    accepts: true,
  },
  {
    name: 'rejects unknown top-level response fields',
    response: { entry: APPEND_LOG_ENTRY, routing: APPEND_LOG_ROUTING, extra: true },
    accepts: false,
  },
  {
    name: 'rejects a non-object routing echo',
    response: { entry: APPEND_LOG_ENTRY, routing: 'review' },
    accepts: false,
  },
  {
    name: 'rejects missing routing fields',
    response: { entry: APPEND_LOG_ENTRY, routing: { class: 'review' } },
    accepts: false,
  },
  {
    name: 'rejects unknown routing fields',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, extra: true } },
    accepts: false,
  },
  {
    name: 'rejects an invalid routing class',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, class: 7 } },
    accepts: false,
  },
  {
    name: 'rejects an invalid routing recipient collection',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, recipients: 'reviewer' } },
    accepts: false,
  },
  {
    name: 'rejects invalid routing recipient members',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, recipients: [7] } },
    accepts: false,
  },
  {
    name: 'rejects an invalid routing fell-open flag',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, fellOpen: 'false' } },
    accepts: false,
  },
  {
    name: 'rejects an invalid routing message',
    response: { entry: APPEND_LOG_ENTRY, routing: { ...APPEND_LOG_ROUTING, message: 7 } },
    accepts: false,
  },
  {
    name: 'rejects a non-array unreachable-recipient list',
    response: { entry: APPEND_LOG_ENTRY, unreachableRecipients: {} },
    accepts: false,
  },
  {
    name: 'rejects a non-object unreachable recipient',
    response: { entry: APPEND_LOG_ENTRY, unreachableRecipients: ['missing-reviewer'] },
    accepts: false,
  },
  {
    name: 'rejects missing unreachable-recipient fields',
    response: { entry: APPEND_LOG_ENTRY, unreachableRecipients: [{ id: 'missing-reviewer' }] },
    accepts: false,
  },
  {
    name: 'rejects unknown unreachable-recipient fields',
    response: {
      entry: APPEND_LOG_ENTRY,
      unreachableRecipients: [{ id: 'missing-reviewer', label: 'Missing Reviewer', extra: true }],
    },
    accepts: false,
  },
  {
    name: 'rejects an invalid unreachable-recipient id',
    response: {
      entry: APPEND_LOG_ENTRY,
      unreachableRecipients: [{ id: 7, label: 'Missing Reviewer' }],
    },
    accepts: false,
  },
  {
    name: 'rejects an invalid unreachable-recipient label',
    response: {
      entry: APPEND_LOG_ENTRY,
      unreachableRecipients: [{ id: 'missing-reviewer', label: null }],
    },
    accepts: false,
  },
];

export const ROLE_SECTION_ROUND_TRIP_CONFORMANCE: readonly string[] = [
  '',
  'Preamble only.',
  'Preamble.\n\nWorkflow:\n- step one\n\nProject conventions:\n- TDD.\n',
  '**Markdown heading:**\nMust remain part of the preamble.\n',
];

export interface EnrollmentRetryConformanceVector {
  name: string;
  initial: EnrollmentExchangeRequest;
  retry: EnrollmentExchangeRequest;
  expected:
    | {
      outcome: 'stable_non_secret_identity';
      status: 201;
      forbidden_response_fields: readonly [
        'credential',
        'client_credential',
        'invitation',
        'retry_key',
      ];
    }
    | {
      outcome: 'uniform_auth_invalid';
      status: 401;
      error: 'AUTH_INVALID';
    };
}

const ENROLLMENT_ARTIFACT: InvitationArtifact = {
  version: 2,
  endpoint: 'https://borg.example.test:7091',
  ca_spki_sha256: 'a'.repeat(64),
  authority: 'client',
  secret: 'S'.repeat(43),
  integrity: 'I'.repeat(43),
};
const ENROLLMENT_ARTIFACT_TOKEN = encodeInvitationArtifact(ENROLLMENT_ARTIFACT);

export const INVITATION_ARTIFACT_CONFORMANCE: readonly ConformanceVector<
  string,
  InvitationArtifact | null
>[] = [
  {
    name: 'decodes the canonical v2 invitation artifact',
    input: ENROLLMENT_ARTIFACT_TOKEN,
    expected: ENROLLMENT_ARTIFACT,
  },
  {
    name: 'rejects a legacy opaque invitation before use',
    input: 'I'.repeat(43),
    expected: null,
  },
  {
    name: 'rejects a mangled noncanonical invitation token',
    input: `${ENROLLMENT_ARTIFACT_TOKEN}=`,
    expected: null,
  },
  {
    name: 'rejects an invitation token above the outer bound',
    input: 'A'.repeat(1025),
    expected: null,
  },
  {
    name: 'rejects a token with a duplicate trailing field',
    input: `${ENROLLMENT_ARTIFACT_TOKEN}A`,
    expected: null,
  },
];

const ENROLLMENT_INVITATION = encodeInvitationArtifact({
  ...ENROLLMENT_ARTIFACT,
  authority: 'client',
});
const ENROLLMENT_CREDENTIAL = 'A'.repeat(43);
const ENROLLMENT_RETRY_KEY = '00000000-0000-4000-8000-000000000101';

/** Stateful vectors: adapters must compare the complete canonical retry tuple. */
export const ENROLLMENT_RETRY_CONFORMANCE: readonly EnrollmentRetryConformanceVector[] = [
  {
    name: 'exact credential-proven retry returns stable non-secret identities',
    initial: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
      client_name: 'operator-laptop',
    },
    retry: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
      client_name: 'operator-laptop',
    },
    expected: {
      outcome: 'stable_non_secret_identity',
      status: 201,
      forbidden_response_fields: [
        'credential',
        'client_credential',
        'invitation',
        'retry_key',
      ],
    },
  },
  {
    name: 'retry-key mismatch is uniformly invalid',
    initial: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
    },
    retry: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: '00000000-0000-4000-8000-000000000102',
      client_credential: ENROLLMENT_CREDENTIAL,
    },
    expected: { outcome: 'uniform_auth_invalid', status: 401, error: 'AUTH_INVALID' },
  },
  {
    name: 'credential mismatch is uniformly invalid',
    initial: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
    },
    retry: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: 'E'.repeat(43),
    },
    expected: { outcome: 'uniform_auth_invalid', status: 401, error: 'AUTH_INVALID' },
  },
  {
    name: 'client-name mismatch is uniformly invalid',
    initial: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
      client_name: 'operator-laptop',
    },
    retry: {
      invitation: ENROLLMENT_INVITATION,
      retry_key: ENROLLMENT_RETRY_KEY,
      client_credential: ENROLLMENT_CREDENTIAL,
      client_name: 'different-client',
    },
    expected: { outcome: 'uniform_auth_invalid', status: 401, error: 'AUTH_INVALID' },
  },
];

export interface CreateCubeRetryConformanceVector {
  name: string;
  initial: CreateCubeRequest;
  retry: CreateCubeRequest;
  expected:
    | { outcome: 'resolved_response'; status: 201 }
    | { outcome: 'retry_tuple_mismatch'; status: 409; error: 'INVALID_INPUT' };
}

const CREATE_CUBE_RETRY_KEY = '00000000-0000-4000-8000-000000000121';
const CREATE_CUBE_INITIAL: CreateCubeRequest = {
  retry_key: CREATE_CUBE_RETRY_KEY,
  name: 'Repository One',
  working_repo_name: 'repository-one',
  repository: { kind: 'origin', value: 'https://github.com/Byte-Ventures/repository-one' },
  template: 'default',
};

export interface CubeTemplateAcceptanceConformanceVector {
  name: string;
  template: unknown;
  accepts: boolean;
}

/** Protocol v6's complete closed acceptance set for cube-creation templates. */
export const CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE:
readonly CubeTemplateAcceptanceConformanceVector[] = [
  { name: 'accepts the legacy default template', template: 'default', accepts: true },
  { name: 'accepts the software-development template', template: 'software-dev', accepts: true },
  { name: 'accepts the starter template', template: 'starter', accepts: true },
  { name: 'accepts the local-model template', template: 'local-model', accepts: true },
  { name: 'rejects an unknown template name', template: 'custom', accepts: false },
  { name: 'rejects a non-string template', template: null, accepts: false },
];

/** Stateful vectors: name, repository identity, and template bind the retry key. */
export const CREATE_CUBE_RETRY_CONFORMANCE: readonly CreateCubeRetryConformanceVector[] = [
  {
    name: 'exact retry resolves the authoritative response',
    initial: CREATE_CUBE_INITIAL,
    retry: CREATE_CUBE_INITIAL,
    expected: { outcome: 'resolved_response', status: 201 },
  },
  {
    name: 'changed repository display metadata resolves stored authoritative display',
    initial: CREATE_CUBE_INITIAL,
    retry: { ...CREATE_CUBE_INITIAL, working_repo_name: 'repository-one-renamed' },
    expected: { outcome: 'resolved_response', status: 201 },
  },
  {
    name: 'cube-name mismatch is rejected',
    initial: CREATE_CUBE_INITIAL,
    retry: { ...CREATE_CUBE_INITIAL, name: 'Repository One Renamed' },
    expected: { outcome: 'retry_tuple_mismatch', status: 409, error: 'INVALID_INPUT' },
  },
  {
    name: 'template mismatch is rejected',
    initial: CREATE_CUBE_INITIAL,
    retry: { ...CREATE_CUBE_INITIAL, template: 'software-dev' },
    expected: { outcome: 'retry_tuple_mismatch', status: 409, error: 'INVALID_INPUT' },
  },
  {
    name: 'repository kind mismatch is rejected',
    initial: CREATE_CUBE_INITIAL,
    retry: {
      ...CREATE_CUBE_INITIAL,
      repository: { kind: 'local', value: '00000000-0000-4000-8000-000000000122' },
    },
    expected: { outcome: 'retry_tuple_mismatch', status: 409, error: 'INVALID_INPUT' },
  },
  {
    name: 'repository value mismatch is rejected',
    initial: CREATE_CUBE_INITIAL,
    retry: {
      ...CREATE_CUBE_INITIAL,
      repository: { kind: 'origin', value: 'https://github.com/Byte-Ventures/repository-two' },
    },
    expected: { outcome: 'retry_tuple_mismatch', status: 409, error: 'INVALID_INPUT' },
  },
];

export interface CreateCubeAssociationConformanceVector {
  name: string;
  created: CreateCubeRequest;
  request: CreateCubeRequest;
  expected:
    | { outcome: 'resolved'; authority_state_delta: Record<string, never> }
    | {
      outcome: 'created';
      authority_state_delta: {
        cubes: 1;
        roles: 2;
        grants: 1;
        cube_create_bindings: 1;
        repository_associations: 1;
      };
    };
}

/** A creator-scoped repository association resolves independently of operation retry keys. */
export const CREATE_CUBE_ASSOCIATION_CONFORMANCE:
readonly CreateCubeAssociationConformanceVector[] = [
  {
    name: 'fresh retry for the same repository resolves stored authoritative fields',
    created: CREATE_CUBE_INITIAL,
    request: {
      ...CREATE_CUBE_INITIAL,
      retry_key: '00000000-0000-4000-8000-000000000123',
      name: 'Ignored New Cube Name',
      working_repo_name: 'ignored-new-display',
      template: 'starter',
    },
    expected: { outcome: 'resolved', authority_state_delta: {} },
  },
  {
    name: 'fresh retry for a different repository may create',
    created: CREATE_CUBE_INITIAL,
    request: {
      ...CREATE_CUBE_INITIAL,
      retry_key: '00000000-0000-4000-8000-000000000124',
      name: 'Repository Two',
      working_repo_name: 'repository-two',
      repository: { kind: 'origin', value: 'https://github.com/Byte-Ventures/repository-two' },
    },
    expected: {
      outcome: 'created',
      authority_state_delta: {
        cubes: 1,
        roles: 2,
        grants: 1,
        cube_create_bindings: 1,
        repository_associations: 1,
      },
    },
  },
];

export interface DeleteCubeConformanceVector {
  name: string;
  request: DeleteCubeRequest;
  expected: {
    status: 200 | 403 | 404 | 410;
    error?: 'ACCESS_DENIED' | 'NOT_FOUND' | 'CUBE_DELETED';
    response?: { deleted: true };
    terminal_sse?: { event: 'error'; error: 'CUBE_DELETED'; closes_after_event: true };
    durable_after_restart?: true;
    mutation: 'cascade' | 'none';
  };
}

/** Cube deletion is manage-gated, cascading, terminal, and durable across authority restart. */
export const DELETE_CUBE_CONFORMANCE: readonly DeleteCubeConformanceVector[] = [
  {
    name: 'non-member managing parent deletes the cube atomically',
    request: {},
    expected: { status: 200, response: { deleted: true }, mutation: 'cascade' },
  },
  {
    name: 'known read and write grants and drone sessions cannot delete',
    request: {},
    expected: { status: 403, error: 'ACCESS_DENIED', mutation: 'none' },
  },
  {
    name: 'never-authorized and unknown callers cannot enumerate the cube',
    request: {},
    expected: { status: 404, error: 'NOT_FOUND', mutation: 'none' },
  },
  {
    name: 'connected clients receive one terminal error frame before close',
    request: {},
    expected: {
      status: 410,
      error: 'CUBE_DELETED',
      terminal_sse: { event: 'error', error: 'CUBE_DELETED', closes_after_event: true },
      mutation: 'none',
    },
  },
  {
    name: 'former authorized credentials retain the typed terminal state after restart',
    request: {},
    expected: {
      status: 410,
      error: 'CUBE_DELETED',
      durable_after_restart: true,
      mutation: 'none',
    },
  },
];

export interface ResolveRepositoryCubeConformanceVector {
  name: string;
  request: ResolveRepositoryCubeRequest;
  associated: boolean;
  expected:
    | { outcome: 'none'; status: 200; authority_state_delta: Record<string, never> }
    | { outcome: 'resolved'; status: 200; authority_state_delta: Record<string, never> };
}

const REPOSITORY_CUBE_ONE = '00000000-0000-4000-8000-000000000131';
const REPOSITORY_ONE: ResolveRepositoryCubeRequest = {
  working_repo_name: 'repository-one',
  repository: { kind: 'origin', value: 'https://github.com/Byte-Ventures/repository-one' },
};
const REPOSITORY_TWO: ResolveRepositoryCubeRequest = {
  working_repo_name: 'repository-two',
  repository: { kind: 'origin', value: 'https://github.com/Byte-Ventures/repository-two' },
};

/** Resolution is read-only and returns only explicit none or authoritative stored fields. */
export const RESOLVE_REPOSITORY_CUBE_CONFORMANCE:
readonly ResolveRepositoryCubeConformanceVector[] = [
  {
    name: 'unassociated repository resolves explicit none without mutation',
    request: REPOSITORY_ONE,
    associated: false,
    expected: { outcome: 'none', status: 200, authority_state_delta: {} },
  },
  {
    name: 'associated repository resolves authoritative stored fields without mutation',
    request: { ...REPOSITORY_ONE, working_repo_name: 'ignored-new-display' },
    associated: true,
    expected: { outcome: 'resolved', status: 200, authority_state_delta: {} },
  },
];

export interface AssociateRepositoryCubeConformanceVector {
  name: string;
  initial: AssociateRepositoryCubeRequest;
  retry: AssociateRepositoryCubeRequest;
  expected:
    | {
      outcome: 'resolved';
      status: 200;
      initial_authority_state_delta: { repository_associations: 1 };
      retry_authority_state_delta: Record<string, never>;
    }
    | {
      outcome: 'repository_conflict' | 'cube_conflict';
      status: 409;
      error: 'REPOSITORY_ALREADY_ASSOCIATED' | 'CUBE_ALREADY_ASSOCIATED';
      diagnostic_disclosure: 'none';
      retry_authority_state_delta: Record<string, never>;
    };
}

/** Explicit cube IDs bind atomically; names never select or identify a cube. */
export const ASSOCIATE_REPOSITORY_CUBE_CONFORMANCE:
readonly AssociateRepositoryCubeConformanceVector[] = [
  {
    name: 'same explicit cube and repository binding is idempotent',
    initial: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    retry: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    expected: {
      outcome: 'resolved',
      status: 200,
      initial_authority_state_delta: { repository_associations: 1 },
      retry_authority_state_delta: {},
    },
  },
  {
    name: 'repository already bound to another cube conflicts without mutation',
    initial: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    retry: { cube_id: '00000000-0000-4000-8000-000000000132', ...REPOSITORY_ONE },
    expected: {
      outcome: 'repository_conflict',
      status: 409,
      error: 'REPOSITORY_ALREADY_ASSOCIATED',
      diagnostic_disclosure: 'none',
      retry_authority_state_delta: {},
    },
  },
  {
    name: 'cube already bound to another repository conflicts without mutation',
    initial: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    retry: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_TWO },
    expected: {
      outcome: 'cube_conflict',
      status: 409,
      error: 'CUBE_ALREADY_ASSOCIATED',
      diagnostic_disclosure: 'none',
      retry_authority_state_delta: {},
    },
  },
];

export const REPOSITORY_CUBE_PERMISSION_CONFORMANCE = [
  {
    name: 'association denies an inaccessible explicit cube without mutation',
    request: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    expected: { status: 403, error: 'ACCESS_DENIED', authority_state_delta: {} },
  },
  {
    name: 'same-client binding to an inaccessible cube is non-enumerating',
    request: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    precondition: 'repository_bound_to_inaccessible_cube',
    expected: {
      resolve: { status: 200, outcome: 'none', authority_state_delta: {} },
      associate: {
        status: 403,
        error: 'ACCESS_DENIED',
        diagnostic_disclosure: 'none',
        authority_state_delta: {},
      },
    },
  },
  {
    name: 'another client binding is neither resolved nor treated as a conflict',
    request: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    precondition: 'repository_bound_by_another_client',
    expected: {
      resolve: { status: 200, outcome: 'none', authority_state_delta: {} },
      associate: {
        status: 200,
        outcome: 'resolved',
        authority_state_delta: { repository_associations: 1 },
      },
    },
  },
] as const;

export const REPOSITORY_CUBE_AUTHORITATIVE_STATE_CONFORMANCE = [
  {
    name: 'legacy cube with invalid authoritative roles is rejected without mutation',
    request: { cube_id: REPOSITORY_CUBE_ONE, ...REPOSITORY_ONE },
    expected: {
      status: 409,
      error: 'INVALID_INPUT',
      diagnostic_disclosure: 'none',
      authority_state_delta: {},
    },
  },
] as const;

export const ENROLLMENT_AUTHORITY_CONFORMANCE = [
  {
    name: 'ordinary enrollment creates no authority or cube state',
    response: {
      purpose: 'client',
      client_id: '00000000-0000-4000-8000-000000000111',
      server_capabilities: [],
    },
    expected_state_delta: { cubes: 0, roles: 0, grants: 0, server_capabilities: 0 },
  },
  {
    name: 'owner enrollment grants create-cube authority without cube state',
    response: {
      purpose: 'owner',
      client_id: '00000000-0000-4000-8000-000000000111',
      server_capabilities: ['create_cube'],
    },
    expected_state_delta: { cubes: 0, roles: 0, grants: 0, server_capabilities: 1 },
  },
] as const;

export const ENROLLMENT_REDACTION_CONFORMANCE: readonly ConformanceVector<string, string>[] = [
  {
    name: 'redacts invitation and client credential from diagnostics',
    input: `invitation=${ENROLLMENT_INVITATION} client_credential=${ENROLLMENT_CREDENTIAL}`,
    expected: 'invitation=<REDACTED> client_credential=<REDACTED>',
  },
  {
    name: 'redacts a contextual enrollment retry key',
    input: `retry_key=${ENROLLMENT_RETRY_KEY}`,
    expected: 'retry_key=<REDACTED>',
  },
  {
    name: 'preserves unrelated public UUIDs',
    input: `cube_id=${ENROLLMENT_RETRY_KEY}`,
    expected: `cube_id=${ENROLLMENT_RETRY_KEY}`,
  },
];

export interface AttachSessionConformanceVector {
  name: string;
  response: unknown;
  accepts: boolean;
}

const ATTACH_RESPONSE = {
  result: 'created',
  cube: { id: '10000000-0000-4000-8000-000000000001', name: 'test-cube' },
  role: { id: '20000000-0000-4000-8000-000000000001', name: 'Coordinator' },
  drone: {
    id: '30000000-0000-4000-8000-000000000001',
    label: 'one-of-one-coordinator',
    runtime_metadata: {
      agent_kind: null,
      reported_model: null,
      working_repo_name: null,
      working_repo_origin: null,
    },
    runtime_metadata_reported: false,
  },
  session: { id: '40000000-0000-4000-8000-000000000001' },
} satisfies AttachResponse;

/** Wire vectors for the v3 non-expiring attach-session response. */
export const ATTACH_SESSION_CONFORMANCE: readonly AttachSessionConformanceVector[] = [
  { name: 'accepts exact non-expiring session id', response: ATTACH_RESPONSE, accepts: true },
  {
    name: 'rejects retired expires_at field',
    response: {
      ...ATTACH_RESPONSE,
      session: { ...ATTACH_RESPONSE.session, expires_at: '2026-07-18T15:00:00.000Z' },
    },
    accepts: false,
  },
  {
    name: 'rejects session fields beyond id',
    response: { ...ATTACH_RESPONSE, session: { ...ATTACH_RESPONSE.session, extra: 'value' } },
    accepts: false,
  },
];

export interface RuntimeMetadataRepositoryConformanceVector {
  name: string;
  origin: string;
  expected: { working_repo_name: string; working_repo_origin: string } | null;
}

/** One canonical corpus consumed unchanged by shared, server, and client tests. */
export const RUNTIME_METADATA_REPOSITORY_CONFORMANCE:
readonly RuntimeMetadataRepositoryConformanceVector[] = [
  {
    name: 'canonical HTTPS',
    origin: 'https://github.com/Byte-Ventures/borg-mcp',
    expected: {
      working_repo_name: 'Byte-Ventures/borg-mcp',
      working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
    },
  },
  {
    name: 'HTTPS default port and suffix',
    origin: 'https://GITHUB.com:443/Byte-Ventures/borg-mcp.git',
    expected: {
      working_repo_name: 'Byte-Ventures/borg-mcp',
      working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
    },
  },
  {
    name: 'SSH URL',
    origin: 'ssh://git@github.com:22/Byte-Ventures/borg-mcp.git',
    expected: {
      working_repo_name: 'Byte-Ventures/borg-mcp',
      working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
    },
  },
  {
    name: 'SCP syntax',
    origin: 'git@github.com:Byte-Ventures/borg-mcp.git',
    expected: {
      working_repo_name: 'Byte-Ventures/borg-mcp',
      working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
    },
  },
  { name: 'HTTPS userinfo', origin: 'https://user@github.com/owner/repo', expected: null },
  { name: 'SSH arbitrary user', origin: 'ssh://owner@github.com/owner/repo', expected: null },
  { name: 'query', origin: 'https://github.com/owner/repo?token=value', expected: null },
  { name: 'fragment', origin: 'https://github.com/owner/repo#fragment', expected: null },
  { name: 'percent encoding', origin: 'https://github.com/owner/re%70o', expected: null },
  { name: 'non-default port', origin: 'https://github.com:444/owner/repo', expected: null },
  { name: 'local file URL', origin: ['file:/', '', 'home', 'user', 'repo'].join('/'), expected: null },
  { name: 'relative path', origin: ['..', 'repo'].join('/'), expected: null },
  { name: 'loopback host', origin: 'https://127.0.0.1/owner/repo', expected: null },
  { name: 'IPv6 host', origin: 'https://[::1]/owner/repo', expected: null },
  { name: 'single-label host', origin: 'https://git/owner/repo', expected: null },
  { name: 'private suffix', origin: 'https://git.internal/owner/repo', expected: null },
];
