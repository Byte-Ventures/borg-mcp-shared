import type { BroadcastHwm } from '../log-stream-hwm.js';
import type { AttachResponse, EnrollmentExchangeRequest } from '../protocol/contract.js';

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

const ENROLLMENT_INVITATION = 'I'.repeat(43);
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
  drone: { id: '30000000-0000-4000-8000-000000000001', label: 'one-of-one-coordinator' },
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
