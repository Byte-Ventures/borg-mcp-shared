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
//# sourceMappingURL=index.js.map