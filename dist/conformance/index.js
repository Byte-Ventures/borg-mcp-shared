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
];
export const ENROLLMENT_REDACTION_CONFORMANCE = [
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
    },
    session: { id: '40000000-0000-4000-8000-000000000001' },
};
export const ATTACH_SESSION_CONFORMANCE = [
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
export const RUNTIME_METADATA_REPOSITORY_CONFORMANCE = [
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
//# sourceMappingURL=index.js.map