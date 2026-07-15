export * from './adapter.js';
export const BROADCAST_HWM_CONFORMANCE = [
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
export const DRONE_ADDRESS_CONFORMANCE = [
    {
        name: 'formats the stable lowercase eight-character id prefix',
        input: '3336CDE1-a76e-4e89-8bc2-77c149bb6a74',
        expected: '`id:3336cde1`',
    },
];
export const ROLE_SECTION_ROUND_TRIP_CONFORMANCE = [
    '',
    'Preamble only.',
    'Preamble.\n\nWorkflow:\n- step one\n\nProject conventions:\n- TDD.\n',
    '**Markdown heading:**\nMust remain part of the preamble.\n',
];
const ENROLLMENT_INVITATION = 'I'.repeat(43);
const ENROLLMENT_CREDENTIAL = 'A'.repeat(43);
const ENROLLMENT_RETRY_KEY = '00000000-0000-4000-8000-000000000101';
export const ENROLLMENT_RETRY_CONFORMANCE = [
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
        name: 'ordinary enrollment creates no grant',
        response: {
            purpose: 'client',
            client_id: '00000000-0000-4000-8000-000000000111',
        },
        expected_created_grants: 0,
    },
    {
        name: 'bootstrap claim returns one cube-scoped parent grant and two role identities',
        response: {
            purpose: 'bootstrap',
            client_id: '00000000-0000-4000-8000-000000000111',
            cube_id: '00000000-0000-4000-8000-000000000112',
            human_seat_role_id: '00000000-0000-4000-8000-000000000113',
            default_worker_role_id: '00000000-0000-4000-8000-000000000114',
            access: 'manage',
        },
        expected_created_grants: 1,
    },
];
export const ENROLLMENT_REDACTION_CONFORMANCE = [
    {
        name: 'redacts invitation and client credential from diagnostics',
        input: `invitation=${ENROLLMENT_INVITATION} client_credential=${ENROLLMENT_CREDENTIAL}`,
        expected: 'invitation=<REDACTED> client_credential=<REDACTED>',
    },
];
//# sourceMappingURL=index.js.map