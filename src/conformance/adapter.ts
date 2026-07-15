import {
  ErrorCode,
  ProtocolContractError,
  compareLogCursor,
  createProtocolEnvelope,
  decodeCreateCubeResponseEnvelope,
  decodeAppendLogResultEnvelope,
  decodeDecisionResultEnvelope,
  decodeDecisionsResultEnvelope,
  decodeEnrollmentExchangeResponseEnvelope,
  decodeProtocolErrorEnvelope,
  decodeProtocolInfoEnvelope,
  decodeReadLogResultEnvelope,
  decodeSseFrames,
  negotiateProtocol,
  utf8ByteLength,
  type Capability,
  type CreateCubeResponse,
  type LogCursor,
  type ProtocolInfo,
  type StreamEvent,
} from '../protocol/index.js';
import { ENROLLMENT_RETRY_CONFORMANCE } from './index.js';

export interface ConformanceHttpResponse {
  status: number;
  body: unknown;
}

export interface ConformancePrincipal {
  readonly id: string;
}

export interface ConformanceCube {
  readonly id: string;
}

export interface ConformanceAuthorityState {
  enrolled_clients: number;
  enrollment_claims: number;
  cubes: number;
  roles: number;
  grants: number;
  server_capabilities: number;
  cube_create_bindings: number;
}

export interface ConformanceCreatedCubeState {
  cube_exists: boolean;
  creator_has_grant: boolean;
  grant_count: number;
  role_count: number;
  human_seat_role_matches: boolean;
  default_worker_role_matches: boolean;
}

export interface ConformanceReplayBarrier {
  /** Resolves after the replay snapshot is read but before live delivery is active. */
  readonly reached: Promise<void>;
  release(): void;
}

export interface ConformanceStreamResponse extends ConformanceHttpResponse {
  /** Present only for a successful streaming response. Chunks are raw SSE wire text. */
  stream: AsyncIterable<string> | null;
}

/**
 * Privileged test-only controls. Production request handlers must never expose
 * these operations; an adapter implements them through its test fixture layer.
 */
export interface ConformanceAdmin {
  reset(): Promise<void>;
  createPrincipal(name: string): Promise<ConformancePrincipal>;
  createCube(name: string): Promise<ConformanceCube>;
  grantCube(principal: ConformancePrincipal, cube: ConformanceCube): Promise<void>;
  issueSingleUseInvitation(principal: ConformancePrincipal, purpose: 'owner' | 'client'): Promise<string>;
  observeAuthorityState(): Promise<ConformanceAuthorityState>;
  inspectCreatedCube(
    creator: ConformancePrincipal,
    response: CreateCubeResponse,
  ): Promise<ConformanceCreatedCubeState>;
  revokePrincipal(principal: ConformancePrincipal): Promise<void>;
  expireCursor(cube: ConformanceCube, cursor: LogCursor): Promise<void>;
  armReplayTransition(): ConformanceReplayBarrier;
}

/** Raw, authenticated adapter operations driven entirely by the shared runner. */
export interface ConformanceOperations {
  health(): Promise<ConformanceHttpResponse>;
  protocol(credential: string | null): Promise<ConformanceHttpResponse>;
  enroll(request: unknown): Promise<ConformanceHttpResponse>;
  createCube(credential: string | null, request: unknown): Promise<ConformanceHttpResponse>;
  append(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  /** Sends an exact UTF-8 JSON body through the adapter's size and parsing boundary. */
  appendRaw(
    credential: string,
    cube: ConformanceCube,
    body: string,
  ): Promise<ConformanceHttpResponse>;
  read(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  ack(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  recordDecision(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  listDecisions(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  openStream(
    credential: string,
    cube: ConformanceCube,
    cursor: LogCursor | null,
  ): Promise<ConformanceStreamResponse>;
}

export interface ConformanceEnvironment {
  readonly admin: ConformanceAdmin;
  readonly operations: ConformanceOperations;
}

export const ADAPTER_CONFORMANCE_FIXTURES = [
  { id: 'http.unauthenticated-liveness', area: 'http' },
  { id: 'protocol.enrollment-auth', area: 'protocol' },
  { id: 'security.adapter-boundary-injection', area: 'security' },
  { id: 'security.oversize-request', area: 'security' },
  { id: 'security.cross-cube-isolation', area: 'security' },
  { id: 'log.read-cursor-tuple', area: 'cursor' },
  { id: 'sse.replay-live-transition', area: 'sse' },
  { id: 'cursor.explicit-expiry', area: 'cursor' },
  { id: 'acks.idempotent', area: 'acks' },
  { id: 'claims.durable-noncursor', area: 'claims' },
  { id: 'decisions.topic-supersession', area: 'decisions' },
  { id: 'capabilities.unsupported-fails-closed', area: 'capabilities' },
  { id: 'security.active-stream-revocation', area: 'security' },
] as const;

export type AdapterConformanceFixtureId =
  (typeof ADAPTER_CONFORMANCE_FIXTURES)[number]['id'];

export interface AdapterConformanceResult {
  id: AdapterConformanceFixtureId;
  ok: boolean;
  observations: Record<string, unknown>;
  error?: string;
}

export interface AdapterConformanceReport {
  ok: boolean;
  results: AdapterConformanceResult[];
  /** Stable, identifier-free observations suitable for cross-adapter comparison. */
  normalizedTranscript: ReadonlyArray<{
    id: AdapterConformanceFixtureId;
    observations: Record<string, unknown>;
  }>;
}

export interface EquivalentAdapterConformanceReport {
  ok: boolean;
  cloud: AdapterConformanceReport;
  local: AdapterConformanceReport;
  equivalent: boolean;
}

export interface AdapterConformanceOptions {
  /** Maximum wait for a replay, live delivery, or revocation close. */
  streamDeadlineMs?: number;
  /** Observation window used to prove an idle stream remains pending. */
  pendingProbeMs?: number;
}

const DEFAULT_STREAM_DEADLINE_MS = 5_000;
const DEFAULT_PENDING_PROBE_MS = 25;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function protocolError(response: ConformanceHttpResponse): ErrorCode | null {
  try {
    return decodeProtocolErrorEnvelope(response.body).error.code;
  } catch {
    return null;
  }
}

function delay(milliseconds: number): Promise<void> {
  const setTimeoutValue = (globalThis as unknown as {
    setTimeout?: (callback: () => void, delay: number) => unknown;
  }).setTimeout;
  if (!setTimeoutValue) throw new Error('Conformance runner requires a timer implementation.');
  return new Promise((resolve) => setTimeoutValue(resolve, milliseconds));
}

async function within<T>(
  promise: Promise<T>,
  description: string,
  deadlineMs: number,
): Promise<T> {
  const timers = globalThis as unknown as {
    setTimeout?: (callback: () => void, delay: number) => unknown;
    clearTimeout?: (timer: unknown) => void;
  };
  if (!timers.setTimeout || !timers.clearTimeout) {
    throw new Error('Conformance runner requires timer cancellation support.');
  }
  return new Promise<T>((resolve, reject) => {
    const timer = timers.setTimeout!(() => {
      reject(new Error(`${description} did not settle within ${deadlineMs}ms.`));
    }, deadlineMs);
    promise.then(
      (value) => {
        timers.clearTimeout!(timer);
        resolve(value);
      },
      (error) => {
        timers.clearTimeout!(timer);
        reject(error);
      },
    );
  });
}

async function provePending<T>(
  promise: Promise<T>,
  description: string,
  probeMs: number,
): Promise<void> {
  const settled = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    delay(probeMs).then(() => false),
  ]);
  invariant(!settled, `${description} settled before new activity.`);
}

class SseEventReader {
  private readonly iterator: AsyncIterator<string>;
  private buffer = '';
  private ended = false;

  constructor(stream: AsyncIterable<string>) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  async next(): Promise<StreamEvent> {
    while (true) {
      this.buffer = this.buffer
        .replace(/\r\n/g, '\n')
        .replace(this.ended ? /\r/g : /\r(?!$)/g, '\n');
      const boundary = this.buffer.search(/\n\n+/);
      if (boundary >= 0) {
        const match = this.buffer.slice(boundary).match(/^\n\n+/);
        invariant(match, 'Internal SSE frame boundary error.');
        const frame = this.buffer.slice(0, boundary);
        this.buffer = this.buffer.slice(boundary + match[0].length);
        if (frame.trim() === '') continue;
        const events = decodeSseFrames(`${frame}\n\n`);
        invariant(events.length === 1, 'Expected exactly one SSE event per frame.');
        return events[0];
      }

      if (this.ended) {
        if (this.buffer.trim() !== '') throw new Error('SSE stream ended with an incomplete frame.');
        throw new Error('SSE stream ended while an event was expected.');
      }
      const chunk = await this.iterator.next();
      if (chunk.done) {
        this.ended = true;
        continue;
      }
      invariant(typeof chunk.value === 'string', 'SSE stream yielded a non-string chunk.');
      this.buffer += chunk.value;
    }
  }

  async close(): Promise<void> {
    if (this.iterator.return) await this.iterator.return();
  }
}

function expectStatus(response: ConformanceHttpResponse, status: number, operation: string): void {
  invariant(
    response.status === status,
    `${operation} returned HTTP ${response.status}; expected ${status}.`,
  );
}

function expectError(
  response: ConformanceHttpResponse,
  status: number,
  code: ErrorCode,
  operation: string,
): void {
  expectStatus(response, status, operation);
  invariant(protocolError(response) === code, `${operation} did not return ${code}.`);
}

function logEvent(event: StreamEvent, description: string): Extract<StreamEvent, { type: 'log' }> {
  invariant(event.type === 'log', `${description} produced ${event.type}, not a log event.`);
  return event;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertStateDelta(
  before: ConformanceAuthorityState,
  after: ConformanceAuthorityState,
  expected: Partial<ConformanceAuthorityState>,
  description: string,
): void {
  for (const key of Object.keys(before) as Array<keyof ConformanceAuthorityState>) {
    invariant(
      after[key] - before[key] === (expected[key] ?? 0),
      `${description} changed ${key} by ${after[key] - before[key]}; expected ${expected[key] ?? 0}.`,
    );
  }
}

function assertEnrollmentErrorIsSecretFree(
  response: ConformanceHttpResponse,
  request: { invitation: string; retry_key: string; client_credential: string },
  description: string,
): void {
  const diagnostic = JSON.stringify(response.body);
  for (const secret of [request.invitation, request.retry_key, request.client_credential]) {
    invariant(!diagnostic.includes(secret), `${description} exposed enrollment retry material.`);
  }
}

export async function runAdapterConformance(
  environment: ConformanceEnvironment,
  options: AdapterConformanceOptions = {},
): Promise<AdapterConformanceReport> {
  const streamDeadlineMs = options.streamDeadlineMs ?? DEFAULT_STREAM_DEADLINE_MS;
  const pendingProbeMs = options.pendingProbeMs ?? DEFAULT_PENDING_PROBE_MS;
  invariant(streamDeadlineMs > 0, 'streamDeadlineMs must be positive.');
  invariant(pendingProbeMs > 0, 'pendingProbeMs must be positive.');
  const results: AdapterConformanceResult[] = [];
  const record = async (
    id: AdapterConformanceFixtureId,
    execute: () => Promise<Record<string, unknown>>,
  ): Promise<void> => {
    try {
      results.push({ id, ok: true, observations: await execute() });
    } catch (error) {
      results.push({
        id,
        ok: false,
        observations: {},
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await environment.admin.reset();
  let principalA!: ConformancePrincipal;
  let principalB!: ConformancePrincipal;
  let cubeA!: ConformanceCube;
  let cubeB!: ConformanceCube;

  let credentialA = '';
  let credentialB = '';
  let protocolBody: unknown;
  let protocolInfo: ProtocolInfo | null = null;
  await record('http.unauthenticated-liveness', async () => {
    const response = await environment.operations.health();
    expectStatus(response, 204, 'Unauthenticated liveness');
    invariant(response.body === '' || response.body === undefined, 'Unauthenticated liveness exposed a response body.');
    return { status: 204, bodyless: true };
  });

  await record('protocol.enrollment-auth', async () => {
    expectError(await environment.operations.protocol(null), 401, ErrorCode.AUTH_MISSING, 'Unauthenticated protocol request');

    const retryVectorErrors: string[] = [];
    for (const [index, vector] of ENROLLMENT_RETRY_CONFORMANCE.entries()) {
      await environment.admin.reset();
      try {
        const principal = await environment.admin.createPrincipal(`retry-vector-${index}`);
        const invitation = await environment.admin.issueSingleUseInvitation(principal, 'client');
        const initialPayload = { ...vector.initial, invitation };
        const retryPayload = { ...vector.retry, invitation };
        const beforeInitial = await environment.admin.observeAuthorityState();
        const initialResponse = await environment.operations.enroll(
          createProtocolEnvelope(`retry-${index}-initial`, initialPayload),
        );
        expectStatus(initialResponse, 201, `${vector.name} initial request`);
        const initial = decodeEnrollmentExchangeResponseEnvelope(initialResponse.body).payload;
        invariant(initial.purpose === 'client', `${vector.name} initial request gained owner authority.`);
        invariant(initial.server_capabilities.length === 0, `${vector.name} ordinary enrollment gained a server capability.`);
        const afterInitial = await environment.admin.observeAuthorityState();
        assertStateDelta(beforeInitial, afterInitial, { enrolled_clients: 1, enrollment_claims: 1 }, `${vector.name} initial request`);

        const beforeRetry = await environment.admin.observeAuthorityState();
        const retryResponse = await environment.operations.enroll(
          createProtocolEnvelope(`retry-${index}-retry`, retryPayload),
        );
        if (vector.expected.outcome === 'stable_non_secret_identity') {
          expectStatus(retryResponse, 201, vector.name);
          const retry = decodeEnrollmentExchangeResponseEnvelope(retryResponse.body).payload;
          invariant(same(initial, retry), `${vector.name} returned different identities.`);
          for (const field of vector.expected.forbidden_response_fields) {
            invariant(!(field in retry), `${vector.name} returned forbidden field ${field}.`);
          }
        } else {
          expectError(retryResponse, vector.expected.status, ErrorCode.AUTH_INVALID, vector.name);
          assertEnrollmentErrorIsSecretFree(retryResponse, retryPayload, vector.name);
        }
        assertStateDelta(beforeRetry, await environment.admin.observeAuthorityState(), {}, `${vector.name} retry`);
      } catch (error) {
        retryVectorErrors.push(`${vector.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    invariant(retryVectorErrors.length === 0, retryVectorErrors.join(' | '));

    await environment.admin.reset();
    const ownerPrincipal = await environment.admin.createPrincipal('owner');
    const ordinaryPrincipal = await environment.admin.createPrincipal('ordinary');
    const ownerInvitation = await environment.admin.issueSingleUseInvitation(ownerPrincipal, 'owner');
    const ordinaryInvitation = await environment.admin.issueSingleUseInvitation(ordinaryPrincipal, 'client');
    const ownerCredential = `${'Q'.repeat(42)}U`;
    const ordinaryCredential = `${'Y'.repeat(42)}U`;
    const beforeAuthorityEnrollment = await environment.admin.observeAuthorityState();
    const ownerResponse = await environment.operations.enroll(createProtocolEnvelope('owner-enroll', {
      invitation: ownerInvitation,
      retry_key: '00000000-0000-4000-8000-000000000211',
      client_credential: ownerCredential,
      client_name: 'owner-client',
    }));
    const ordinaryResponse = await environment.operations.enroll(createProtocolEnvelope('ordinary-enroll', {
      invitation: ordinaryInvitation,
      retry_key: '00000000-0000-4000-8000-000000000212',
      client_credential: ordinaryCredential,
      client_name: 'ordinary-client',
    }));
    expectStatus(ownerResponse, 201, 'Owner enrollment');
    expectStatus(ordinaryResponse, 201, 'Ordinary enrollment');
    const owner = decodeEnrollmentExchangeResponseEnvelope(ownerResponse.body).payload;
    const ordinary = decodeEnrollmentExchangeResponseEnvelope(ordinaryResponse.body).payload;
    invariant(owner.purpose === 'owner' && same(owner.server_capabilities, ['create_cube']), 'Owner enrollment lacked exact create-cube authority.');
    invariant(ordinary.purpose === 'client' && ordinary.server_capabilities.length === 0, 'Ordinary enrollment gained authority.');
    assertStateDelta(
      beforeAuthorityEnrollment,
      await environment.admin.observeAuthorityState(),
      { enrolled_clients: 2, enrollment_claims: 2, server_capabilities: 1 },
      'Owner and ordinary enrollment',
    );

    const cubeRequest = {
      retry_key: '00000000-0000-4000-8000-000000000213',
      name: 'repository-one',
      template: 'default',
    };
    const beforeDeniedCreate = await environment.admin.observeAuthorityState();
    expectError(
      await environment.operations.createCube(null, createProtocolEnvelope('cube-missing-auth', cubeRequest)),
      401,
      ErrorCode.AUTH_MISSING,
      'Missing-auth cube create',
    );
    expectError(
      await environment.operations.createCube('invalid-credential', createProtocolEnvelope('cube-invalid-auth', cubeRequest)),
      401,
      ErrorCode.AUTH_INVALID,
      'Invalid-auth cube create',
    );
    expectError(
      await environment.operations.createCube(ordinaryCredential, createProtocolEnvelope('cube-denied', cubeRequest)),
      403,
      ErrorCode.ACCESS_DENIED,
      'Ordinary cube create',
    );
    assertStateDelta(beforeDeniedCreate, await environment.admin.observeAuthorityState(), {}, 'Denied ordinary cube create');
    const beforeCreate = await environment.admin.observeAuthorityState();
    const createdResponse = await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-create', cubeRequest));
    expectStatus(createdResponse, 201, 'Owner cube create');
    const created = decodeCreateCubeResponseEnvelope(createdResponse.body).payload;
    assertStateDelta(beforeCreate, await environment.admin.observeAuthorityState(), { cubes: 1, roles: 2, grants: 1, cube_create_bindings: 1 }, 'Owner cube create');
    invariant(
      same(await environment.admin.inspectCreatedCube(ownerPrincipal, created), {
        cube_exists: true,
        creator_has_grant: true,
        grant_count: 1,
        role_count: 2,
        human_seat_role_matches: true,
        default_worker_role_matches: true,
      }),
      'Created cube identities or creator grant did not match persisted authority state.',
    );
    const beforeCreateRetry = await environment.admin.observeAuthorityState();
    const retriedCreateResponse = await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-retry', cubeRequest));
    expectStatus(retriedCreateResponse, 201, 'Exact cube-create retry');
    invariant(same(decodeCreateCubeResponseEnvelope(retriedCreateResponse.body).payload, created), 'Exact cube-create retry returned different identities.');
    assertStateDelta(beforeCreateRetry, await environment.admin.observeAuthorityState(), {}, 'Exact cube-create retry');
    const beforeCreateMismatch = await environment.admin.observeAuthorityState();
    expectError(
      await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-mismatch', { ...cubeRequest, name: 'repository-two' })),
      409,
      ErrorCode.INVALID_INPUT,
      'Cube-create retry mismatch',
    );
    assertStateDelta(beforeCreateMismatch, await environment.admin.observeAuthorityState(), {}, 'Cube-create retry mismatch');
    const beforeSecondCreate = await environment.admin.observeAuthorityState();
    const secondCreatedResponse = await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-create-second', {
      ...cubeRequest,
      retry_key: '00000000-0000-4000-8000-000000000214',
      name: 'repository-two',
    }));
    expectStatus(secondCreatedResponse, 201, 'Second cube create');
    const secondCreated = decodeCreateCubeResponseEnvelope(secondCreatedResponse.body).payload;
    invariant(secondCreated.cube_id !== created.cube_id, 'Fresh cube-create retry key reused an existing cube.');
    assertStateDelta(
      beforeSecondCreate,
      await environment.admin.observeAuthorityState(),
      { cubes: 1, roles: 2, grants: 1, cube_create_bindings: 1 },
      'Second cube create',
    );
    await environment.admin.revokePrincipal(ownerPrincipal);
    const beforeRevokedCreate = await environment.admin.observeAuthorityState();
    expectError(
      await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-revoked', {
        ...cubeRequest,
        retry_key: '00000000-0000-4000-8000-000000000215',
      })),
      401,
      ErrorCode.SESSION_REVOKED,
      'Revoked owner cube create',
    );
    assertStateDelta(beforeRevokedCreate, await environment.admin.observeAuthorityState(), {}, 'Revoked owner cube create');

    await environment.admin.reset();
    principalA = await environment.admin.createPrincipal('principal-a');
    principalB = await environment.admin.createPrincipal('principal-b');
    cubeA = await environment.admin.createCube('cube-a');
    cubeB = await environment.admin.createCube('cube-b');
    await environment.admin.grantCube(principalA, cubeA);
    await environment.admin.grantCube(principalB, cubeB);
    const invitationA = await environment.admin.issueSingleUseInvitation(principalA, 'client');
    const invitationB = await environment.admin.issueSingleUseInvitation(principalB, 'client');
    credentialA = 'A'.repeat(43);
    credentialB = 'E'.repeat(43);
    const enrollmentARequest = createProtocolEnvelope('enroll-a1', {
      invitation: invitationA,
      retry_key: '00000000-0000-4000-8000-000000000201',
      client_credential: credentialA,
      client_name: 'conformance-a',
    });
    const enrollmentBRequest = createProtocolEnvelope('enroll-b1', {
      invitation: invitationB,
      retry_key: '00000000-0000-4000-8000-000000000202',
      client_credential: credentialB,
      client_name: 'conformance-b',
    });
    const enrolledAResponse = await environment.operations.enroll(enrollmentARequest);
    const enrolledBResponse = await environment.operations.enroll(enrollmentBRequest);
    expectStatus(enrolledAResponse, 201, 'Principal A enrollment');
    expectStatus(enrolledBResponse, 201, 'Principal B enrollment');
    const enrolledA = decodeEnrollmentExchangeResponseEnvelope(enrolledAResponse.body).payload;
    const enrolledB = decodeEnrollmentExchangeResponseEnvelope(enrolledBResponse.body).payload;
    invariant(enrolledA.purpose === 'client' && enrolledB.purpose === 'client', 'Ordinary enrollment returned owner authority.');
    invariant(enrolledA.server_capabilities.length === 0 && enrolledB.server_capabilities.length === 0, 'Ordinary enrollment returned a server capability.');
    invariant(!('credential' in enrolledA) && !('credential' in enrolledB), 'Enrollment response returned a bearer.');
    const retriedAResponse = await environment.operations.enroll(enrollmentARequest);
    expectStatus(retriedAResponse, 201, 'Exact enrollment retry');
    invariant(
      JSON.stringify(decodeEnrollmentExchangeResponseEnvelope(retriedAResponse.body).payload) ===
      JSON.stringify(enrolledA),
      'Exact enrollment retry returned different identities.',
    );
    expectError(
      await environment.operations.enroll(createProtocolEnvelope('enroll-a-mismatch', {
        ...enrollmentARequest.payload,
        retry_key: '00000000-0000-4000-8000-000000000203',
      })),
      401,
      ErrorCode.AUTH_INVALID,
      'Enrollment retry mismatch',
    );
    const protocolResponse = await environment.operations.protocol(credentialA);
    expectStatus(protocolResponse, 200, 'Authenticated protocol request');
    protocolBody = protocolResponse.body;
    protocolInfo = negotiateProtocol(decodeProtocolInfoEnvelope(protocolBody).payload, [
      'log.cursor',
      'stream.sse',
      'stream.replay',
      'acks',
      'claims',
      'decisions',
    ]);
    return {
      unauthenticated: ErrorCode.AUTH_MISSING,
      enrollment_status: 201,
      exact_retry_status: 201,
      mismatched_retry: ErrorCode.AUTH_INVALID,
      response_secret_free: true,
      protocol_version: protocolInfo.protocol_version,
    };
  });

  await record('security.adapter-boundary-injection', async () => {
    invariant(protocolInfo, 'Protocol fixture did not produce request limits.');
    const injectedMessage = "'); DROP TABLE log_entries; --\r\ndata: forged-sse-frame";
    const injectedBody = JSON.stringify(
      createProtocolEnvelope('inject-b1', { message: injectedMessage }),
    );
    invariant(
      utf8ByteLength(injectedBody) <= protocolInfo.limits.max_request_bytes &&
        utf8ByteLength(injectedMessage) <= protocolInfo.limits.max_log_message_bytes,
      'Injection fixture exceeded an advertised request limit.',
    );
    const injected = await environment.operations.appendRaw(
      credentialB,
      cubeB,
      injectedBody,
    );
    expectStatus(injected, 201, 'Adapter-boundary injection append');
    const injectedEntry = decodeAppendLogResultEnvelope(injected.body).payload.entry;
    invariant(injectedEntry.message === injectedMessage, 'Adapter altered or interpreted injection-shaped log data.');

    const sentinel = await environment.operations.append(
      credentialB,
      cubeB,
      createProtocolEnvelope('inject-b2', { message: 'post-injection-sentinel' }),
    );
    expectStatus(sentinel, 201, 'Post-injection sentinel append');
    const read = await environment.operations.read(
      credentialB,
      cubeB,
      createProtocolEnvelope('inject-read', { cursor: null, limit: 10 }),
    );
    expectStatus(read, 200, 'Post-injection read');
    const messages = decodeReadLogResultEnvelope(read.body).payload.entries.map((entry) => entry.message);
    invariant(
      same(messages, [injectedMessage, 'post-injection-sentinel']),
      'Injection-shaped input was not persisted inertly and exactly.',
    );
    const opened = await environment.operations.openStream(credentialB, cubeB, null);
    expectStatus(opened, 200, 'Post-injection stream open');
    invariant(opened.stream, 'Post-injection stream omitted its AsyncIterable.');
    const reader = new SseEventReader(opened.stream);
    try {
      const first = logEvent(
        await within(reader.next(), 'Injected SSE event', streamDeadlineMs),
        'Injected SSE event',
      );
      const second = logEvent(
        await within(reader.next(), 'Post-injection sentinel SSE event', streamDeadlineMs),
        'Post-injection sentinel SSE event',
      );
      invariant(
        first.entry.message === injectedMessage && second.entry.message === 'post-injection-sentinel',
        'Injection-shaped input escaped or split its SSE frame.',
      );
      const bookmark = await within(reader.next(), 'Post-injection bookmark', streamDeadlineMs);
      invariant(bookmark.type === 'bookmark', 'Post-injection stream produced an extra forged event.');
    } finally {
      await reader.close();
    }
    return {
      status: 201,
      preserved_exactly: true,
      subsequent_write_succeeded: true,
      ordered_messages: 2,
      sse_events: 2,
    };
  });

  await record('security.oversize-request', async () => {
    invariant(protocolInfo, 'Protocol fixture did not produce request limits.');
    const baseBody = JSON.stringify(
      createProtocolEnvelope('oversize-a1', { message: 'must-not-persist' }),
    );
    const oversizedBody = baseBody + ' '.repeat(
      Math.max(0, protocolInfo.limits.max_request_bytes - utf8ByteLength(baseBody) + 1),
    );
    invariant(
      utf8ByteLength(oversizedBody) > protocolInfo.limits.max_request_bytes,
      'Oversize fixture did not exceed max_request_bytes.',
    );
    const response = await environment.operations.appendRaw(credentialA, cubeA, oversizedBody);
    expectError(response, 413, ErrorCode.CONTENT_TOO_LARGE, 'Oversized append request');
    const read = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('oversize-read', { cursor: null, limit: 10 }),
    );
    expectStatus(read, 200, 'Post-oversize read');
    invariant(
      decodeReadLogResultEnvelope(read.body).payload.entries.length === 0,
      'Oversized request was persisted before rejection.',
    );
    return { status: 413, code: ErrorCode.CONTENT_TOO_LARGE, persisted_entries: 0 };
  });

  await record('security.cross-cube-isolation', async () => {
    const secretAppend = await environment.operations.append(
      credentialB,
      cubeB,
      createProtocolEnvelope('append-b1', { message: 'principal-b-secret' }),
    );
    expectStatus(secretAppend, 201, 'Principal B append');
    const denied = await environment.operations.read(
      credentialA,
      cubeB,
      createProtocolEnvelope('read-cross', { cursor: null, limit: 10 }),
    );
    expectError(denied, 404, ErrorCode.NOT_FOUND, 'Cross-cube read');
    return { status: 404, code: ErrorCode.NOT_FOUND };
  });

  const entries: Array<{ id: string; created_at: string; message: string }> = [];
  let readCursor: LogCursor | null = null;
  await record('log.read-cursor-tuple', async () => {
    for (const [index, message] of ['alpha', 'beta', 'gamma'].entries()) {
      const response = await environment.operations.append(
        credentialA,
        cubeA,
        createProtocolEnvelope(`append-a${index + 1}`, { message }),
      );
      expectStatus(response, 201, `Append ${message}`);
      const entry = decodeAppendLogResultEnvelope(response.body).payload.entry;
      entries.push({ id: entry.id, created_at: entry.created_at, message: entry.message });
    }
    const response = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('read-page1', { cursor: null, limit: 2 }),
    );
    expectStatus(response, 200, 'First paged read');
    const page = decodeReadLogResultEnvelope(response.body).payload;
    invariant(same(page.entries.map((entry) => entry.message), ['alpha', 'beta']), 'Read did not honor limit and tuple ordering.');
    invariant(page.has_more && page.behind_by === 1, 'Read pagination metadata is incorrect.');
    invariant(page.cursor !== null, 'Read did not return a cursor.');
    invariant(
      page.cursor.id === entries[1].id && page.cursor.created_at === entries[1].created_at,
      'Read cursor does not equal the final delivered entry tuple.',
    );
    readCursor = page.cursor;
    return { messages: ['alpha', 'beta'], has_more: true, behind_by: 1, cursor_matches_last_entry: true };
  });

  let liveCursor: LogCursor | null = null;
  await record('sse.replay-live-transition', async () => {
    invariant(readCursor, 'Cursor fixture did not produce a cursor.');
    const barrier = environment.admin.armReplayTransition();
    const openPromise = environment.operations.openStream(credentialA, cubeA, readCursor);
    await within(barrier.reached, 'Replay transition boundary', streamDeadlineMs);
    try {
      const appendDelta = environment.operations.append(
        credentialA,
        cubeA,
        createProtocolEnvelope('append-a4', { message: 'delta' }),
      );
      expectStatus(await appendDelta, 201, 'Transition append');
    } finally {
      barrier.release();
    }
    const opened = await within(openPromise, 'Cursor stream open', streamDeadlineMs);
    expectStatus(opened, 200, 'Cursor stream open');
    invariant(opened.stream, 'Successful stream response omitted its AsyncIterable.');
    const reader = new SseEventReader(opened.stream);
    try {
      const replay = logEvent(await within(reader.next(), 'Replay event', streamDeadlineMs), 'Replay');
      invariant(replay.entry.message === 'gamma', 'Stream ignored its cursor or replayed the wrong entry.');
      invariant(compareLogCursor(readCursor, replay.cursor) < 0, 'Replay cursor did not advance.');
      const delta = logEvent(await within(reader.next(), 'Transition delta event', streamDeadlineMs), 'Replay transition');
      invariant(delta.entry.message === 'delta', 'Entry appended at the replay/live boundary was lost.');
      invariant(compareLogCursor(replay.cursor, delta.cursor) < 0, 'Transition cursor did not advance.');
      const bookmark = await within(reader.next(), 'Replay-complete bookmark', streamDeadlineMs);
      invariant(bookmark.type === 'bookmark' && bookmark.replay_complete, 'Stream omitted its replay-complete bookmark.');
      const noDuplicate = reader.next();
      await provePending(noDuplicate, 'Live stream after delta', pendingProbeMs);
      const epsilonResponse = await environment.operations.append(
        credentialA,
        cubeA,
        createProtocolEnvelope('append-a5', { message: 'epsilon' }),
      );
      expectStatus(epsilonResponse, 201, 'Live append');
      const epsilon = logEvent(await within(noDuplicate, 'Live epsilon event', streamDeadlineMs), 'Live append');
      invariant(epsilon.entry.message === 'epsilon', 'Live stream duplicated or reordered an event.');
      invariant(compareLogCursor(delta.cursor, epsilon.cursor) < 0, 'Live stream cursors are not ordered.');
      invariant(new Set([replay.entry.id, delta.entry.id, epsilon.entry.id]).size === 3, 'Stream delivered a duplicate entry.');
      liveCursor = epsilon.cursor;
      return { replay: ['gamma'], transition: 'bookmark', live: ['delta', 'epsilon'], duplicates: 0 };
    } finally {
      await reader.close();
    }
  });

  await record('cursor.explicit-expiry', async () => {
    invariant(readCursor, 'Cursor fixture did not produce a cursor.');
    await environment.admin.expireCursor(cubeA, readCursor);
    const response = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('read-expired', { cursor: readCursor, limit: 10 }),
    );
    expectError(response, 410, ErrorCode.CURSOR_EXPIRED, 'Expired cursor read');
    const stream = await environment.operations.openStream(credentialA, cubeA, readCursor);
    expectError(stream, 410, ErrorCode.CURSOR_EXPIRED, 'Expired cursor stream');
    invariant(stream.stream === null, 'Expired cursor stream exposed a body stream.');
    return { read_status: 410, stream_status: 410, code: ErrorCode.CURSOR_EXPIRED };
  });

  await record('acks.idempotent', async () => {
    invariant(entries[0], 'Append fixture did not produce an entry.');
    const request = createProtocolEnvelope('ack-entry1', { entry_id: entries[0].id, kind: 'ack' });
    const first = await environment.operations.ack(credentialA, cubeA, request);
    const second = await environment.operations.ack(credentialA, cubeA, request);
    expectStatus(first, 204, 'First acknowledgement');
    expectStatus(second, 204, 'Repeated acknowledgement');
    invariant((first.body === '' || first.body === undefined) && (second.body === '' || second.body === undefined), 'Acknowledgement responses must be bodyless.');
    return { first_status: 204, repeated_status: 204, bodyless: true };
  });

  await record('claims.durable-noncursor', async () => {
    invariant(entries[1] && liveCursor, 'Log fixtures did not produce claim state.');
    const claim = await environment.operations.ack(
      credentialA,
      cubeA,
      createProtocolEnvelope('claim-entry2', { entry_id: entries[1].id, kind: 'claim' }),
    );
    expectStatus(claim, 204, 'Claim');
    const read = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('read-claims', { cursor: liveCursor, limit: 10 }),
    );
    expectStatus(read, 200, 'Claim-state read');
    const page = decodeReadLogResultEnvelope(read.body).payload;
    invariant(page.entries.length === 0, 'Claim unexpectedly created a log entry.');
    invariant(page.cursor !== null && compareLogCursor(page.cursor, liveCursor) === 0, 'Claim advanced the log cursor.');
    invariant(page.claims.some((item) => item.log_entry_id === entries[1].id), 'Claim was not durable in a later read.');
    return { durable_claims: 1, entries: 0, cursor_advanced: false };
  });

  await record('decisions.topic-supersession', async () => {
    const firstResponse = await environment.operations.recordDecision(
      credentialA,
      cubeA,
      createProtocolEnvelope('decision1', { topic: 'runtime', decision: 'first' }),
    );
    expectStatus(firstResponse, 201, 'First decision');
    const first = decodeDecisionResultEnvelope(firstResponse.body).payload.decision;
    const secondResponse = await environment.operations.recordDecision(
      credentialA,
      cubeA,
      createProtocolEnvelope('decision2', { topic: 'runtime', decision: 'second', rationale: 'new evidence' }),
    );
    expectStatus(secondResponse, 201, 'Superseding decision');
    const second = decodeDecisionResultEnvelope(secondResponse.body).payload.decision;
    const listResponse = await environment.operations.listDecisions(
      credentialA,
      cubeA,
      createProtocolEnvelope('decisions', {}),
    );
    expectStatus(listResponse, 200, 'Decision list');
    const active = decodeDecisionsResultEnvelope(listResponse.body).payload.decisions;
    invariant(active.length === 1 && active[0].decision === 'second', 'Decision list did not contain only the active superseding decision.');
    invariant(second.supersedes === first.id, 'Superseding decision did not reference its predecessor.');
    return { active_count: 1, active_decision: 'second', supersedes_first: true };
  });

  await record('capabilities.unsupported-fails-closed', async () => {
    invariant(protocolBody, 'Protocol fixture did not produce an envelope.');
    let code: ErrorCode | null = null;
    try {
      negotiateProtocol(
        decodeProtocolInfoEnvelope(protocolBody).payload,
        ['future.required' as Capability],
      );
    } catch (error) {
      if (error instanceof ProtocolContractError) code = error.code;
      else throw error;
    }
    invariant(code === ErrorCode.UNSUPPORTED_CAPABILITY, 'Unsupported capability did not fail closed client-side.');
    return { code };
  });

  await record('security.active-stream-revocation', async () => {
    invariant(liveCursor, 'Stream fixture did not produce a live cursor.');
    const opened = await environment.operations.openStream(credentialA, cubeA, liveCursor);
    expectStatus(opened, 200, 'Revocation stream open');
    invariant(opened.stream, 'Successful revocation stream omitted its AsyncIterable.');
    const reader = new SseEventReader(opened.stream);
    try {
      const bookmark = await within(reader.next(), 'Initial replay-complete bookmark', streamDeadlineMs);
      invariant(bookmark.type === 'bookmark' && bookmark.replay_complete, 'Fresh live stream did not complete replay.');
      const pending = reader.next();
      await provePending(pending, 'Idle live stream', pendingProbeMs);
      await environment.admin.revokePrincipal(principalA);
      let terminated = false;
      try {
        await within(pending, 'Revoked stream termination', streamDeadlineMs);
      } catch (error) {
        if (error instanceof Error && error.message.includes('did not settle')) throw error;
        terminated = true;
      }
      invariant(terminated, 'Revoked stream yielded data instead of terminating.');
    } finally {
      await reader.close();
    }
    const rejected = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('read-revoked', { cursor: liveCursor, limit: 10 }),
    );
    expectError(rejected, 401, ErrorCode.SESSION_REVOKED, 'Post-revocation request');
    return { stream_terminated: true, subsequent_status: 401, subsequent_code: ErrorCode.SESSION_REVOKED };
  });

  const normalizedTranscript = results.map(({ id, observations }) => ({ id, observations }));
  return { ok: results.every((result) => result.ok), results, normalizedTranscript };
}

export async function runEquivalentAdapterConformance(
  cloud: ConformanceEnvironment,
  local: ConformanceEnvironment,
  options: AdapterConformanceOptions = {},
): Promise<EquivalentAdapterConformanceReport> {
  const [cloudReport, localReport] = await Promise.all([
    runAdapterConformance(cloud, options),
    runAdapterConformance(local, options),
  ]);
  const equivalent = same(cloudReport.normalizedTranscript, localReport.normalizedTranscript);
  return {
    ok: cloudReport.ok && localReport.ok && equivalent,
    cloud: cloudReport,
    local: localReport,
    equivalent,
  };
}
