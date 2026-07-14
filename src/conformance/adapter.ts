export type AdapterConformanceArea =
  | 'http'
  | 'errors'
  | 'security'
  | 'sse'
  | 'cursor'
  | 'acks'
  | 'claims'
  | 'decisions'
  | 'capabilities';

export type AdapterConformanceObservation = Record<string, unknown>;

export interface AdapterConformanceFixture {
  id: string;
  area: AdapterConformanceArea;
  description: string;
  expected: AdapterConformanceObservation;
}

export interface AdapterConformanceDriver {
  /** Execute the case against an isolated adapter context and report observations. */
  observe(fixture: AdapterConformanceFixture): Promise<AdapterConformanceObservation>;
}

export const ADAPTER_CONFORMANCE_FIXTURES = [
  {
    id: 'http.unauthenticated-liveness',
    area: 'http',
    description: 'GET /healthz is bodyless and non-identifying without authentication.',
    expected: { status: 204, body: '' },
  },
  {
    id: 'http.protocol-requires-authentication',
    area: 'http',
    description: 'GET /api/protocol rejects missing authentication without metadata.',
    expected: { status: 401, error_code: 'AUTH_MISSING', identifying_data: false },
  },
  {
    id: 'http.enrollment-body-only',
    area: 'http',
    description: 'Enrollment exchanges an invitation in a bounded TLS body, never a URL.',
    expected: { status: 201, invitation_in_url: false, credential_exposed_once: true },
  },
  {
    id: 'errors.non-enumerating-auth-failure',
    area: 'errors',
    description: 'Invalid auth and unknown resources do not disclose tenant existence.',
    expected: { status: 401, error_code: 'AUTH_INVALID', resource_disclosed: false },
  },
  {
    id: 'security.expired-invitation',
    area: 'security',
    description: 'Expired invitations fail without revealing whether a client exists.',
    expected: { accepted: false, error_code: 'AUTH_INVALID', resource_disclosed: false },
  },
  {
    id: 'security.reused-invitation',
    area: 'security',
    description: 'A single-use invitation cannot be exchanged twice.',
    expected: { first_exchange: true, second_exchange: false, error_code: 'AUTH_INVALID' },
  },
  {
    id: 'security.revoked-credential-stream',
    area: 'security',
    description: 'Revocation rejects requests and terminates the active SSE stream.',
    expected: { request_rejected: true, stream_terminated: true, error_code: 'SESSION_REVOKED' },
  },
  {
    id: 'security.cross-cube-isolation',
    area: 'security',
    description: 'Cross-cube access is denied without confirming the foreign resource.',
    expected: { status: 404, error_code: 'NOT_FOUND', resource_disclosed: false },
  },
  {
    id: 'security.oversize-request',
    area: 'security',
    description: 'Oversize bodies are rejected before parsing or persistence.',
    expected: { status: 413, error_code: 'CONTENT_TOO_LARGE' },
  },
  {
    id: 'security.redirect-strips-authorization',
    area: 'security',
    description: 'Authorization is never forwarded across redirects.',
    expected: { followed_redirect: false, authorization_forwarded: false },
  },
  {
    id: 'security.secret-redaction',
    area: 'security',
    description: 'Credentials never appear in errors, events, cursors, or diagnostics.',
    expected: { secret_occurrences: 0 },
  },
  {
    id: 'sse.replay-and-live-order',
    area: 'sse',
    description: 'Replay and live delivery preserve tuple order and deliver transition writes once.',
    expected: { ordered: true, duplicates: 0, transition_losses: 0, replay_complete: true },
  },
  {
    id: 'cursor.expired-is-explicit',
    area: 'cursor',
    description: 'Expired cursors fail explicitly instead of silently returning a recent window.',
    expected: { status: 410, error_code: 'CURSOR_EXPIRED' },
  },
  {
    id: 'acks.idempotent-durable-noncursor',
    area: 'acks',
    description: 'Repeated acks remain one durable state and never advance the SSE cursor.',
    expected: { durable_count: 1, cursor_advanced: false },
  },
  {
    id: 'claims.advisory-durable-noncursor',
    area: 'claims',
    description: 'Claims are advisory, recoverable through reads, and never cursor-bearing.',
    expected: { approval_granted: false, recoverable: true, cursor_advanced: false },
  },
  {
    id: 'decisions.topic-supersession',
    area: 'decisions',
    description: 'Recording a topic supersedes the prior value and leaves one active decision.',
    expected: { active_count: 1, prior_status: 'superseded', current_status: 'active' },
  },
  {
    id: 'capabilities.unsupported-fails-closed',
    area: 'capabilities',
    description: 'A missing required capability fails before an operation or cloud fallback.',
    expected: { status: 501, error_code: 'UNSUPPORTED_CAPABILITY', operation_started: false, cloud_fallback: false },
  },
] as const satisfies readonly AdapterConformanceFixture[];

export interface AdapterConformanceResult {
  id: string;
  area: AdapterConformanceArea;
  ok: boolean;
  expected: AdapterConformanceObservation;
  actual?: AdapterConformanceObservation;
  error?: string;
}

export interface AdapterConformanceReport {
  ok: boolean;
  results: AdapterConformanceResult[];
}

function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => matches(actual[index], value));
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) return false;
    const actualRecord = actual as Record<string, unknown>;
    return Object.entries(expected).every(([key, value]) => matches(actualRecord[key], value));
  }
  return Object.is(actual, expected);
}

export async function runAdapterConformance(
  driver: AdapterConformanceDriver,
): Promise<AdapterConformanceReport> {
  const results: AdapterConformanceResult[] = [];
  for (const fixture of ADAPTER_CONFORMANCE_FIXTURES) {
    try {
      const actual = await driver.observe(fixture);
      results.push({
        id: fixture.id,
        area: fixture.area,
        ok: matches(actual, fixture.expected),
        expected: fixture.expected,
        actual,
      });
    } catch (error) {
      results.push({
        id: fixture.id,
        area: fixture.area,
        ok: false,
        expected: fixture.expected,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ok: results.every((result) => result.ok), results };
}
