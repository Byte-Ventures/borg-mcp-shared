import {
  ErrorCode,
  compareLogCursor,
  createProtocolEnvelope,
  decodeAppendLogResultEnvelope,
  decodeDecisionResultEnvelope,
  decodeDecisionsResultEnvelope,
  decodeEnrollmentExchangeResponseEnvelope,
  decodeProtocolErrorEnvelope,
  decodeProtocolInfoEnvelope,
  decodeReadLogResultEnvelope,
  decodeSseFrames,
  negotiateProtocol,
  type Capability,
  type LogCursor,
  type StreamEvent,
} from '../protocol/index.js';

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
  issueSingleUseInvitation(principal: ConformancePrincipal): Promise<string>;
  revokePrincipal(principal: ConformancePrincipal): Promise<void>;
  expireCursor(cube: ConformanceCube, cursor: LogCursor): Promise<void>;
}

/** Raw, authenticated adapter operations driven entirely by the shared runner. */
export interface ConformanceOperations {
  health(): Promise<ConformanceHttpResponse>;
  protocol(
    credential: string | null,
    requiredCapabilities?: readonly Capability[],
  ): Promise<ConformanceHttpResponse>;
  enroll(request: unknown): Promise<ConformanceHttpResponse>;
  append(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
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
  return Promise.race([
    promise,
    delay(deadlineMs).then(() => {
      throw new Error(`${description} did not settle within ${deadlineMs}ms.`);
    }),
  ]);
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
  const principalA = await environment.admin.createPrincipal('principal-a');
  const principalB = await environment.admin.createPrincipal('principal-b');
  const cubeA = await environment.admin.createCube('cube-a');
  const cubeB = await environment.admin.createCube('cube-b');
  await environment.admin.grantCube(principalA, cubeA);
  await environment.admin.grantCube(principalB, cubeB);
  const invitationA = await environment.admin.issueSingleUseInvitation(principalA);
  const invitationB = await environment.admin.issueSingleUseInvitation(principalB);

  let credentialA = '';
  let credentialB = '';
  let protocolBody: unknown;
  await record('http.unauthenticated-liveness', async () => {
    const response = await environment.operations.health();
    expectStatus(response, 204, 'Unauthenticated liveness');
    invariant(response.body === '' || response.body === undefined, 'Unauthenticated liveness exposed a response body.');
    return { status: 204, bodyless: true };
  });

  await record('protocol.enrollment-auth', async () => {
    expectError(await environment.operations.protocol(null), 401, ErrorCode.AUTH_MISSING, 'Unauthenticated protocol request');
    const enrollmentARequest = createProtocolEnvelope('enroll-a1', {
      invitation: invitationA,
      client_name: 'conformance-a',
    });
    const enrollmentBRequest = createProtocolEnvelope('enroll-b1', {
      invitation: invitationB,
      client_name: 'conformance-b',
    });
    const enrolledAResponse = await environment.operations.enroll(enrollmentARequest);
    const enrolledBResponse = await environment.operations.enroll(enrollmentBRequest);
    expectStatus(enrolledAResponse, 201, 'Principal A enrollment');
    expectStatus(enrolledBResponse, 201, 'Principal B enrollment');
    credentialA = decodeEnrollmentExchangeResponseEnvelope(enrolledAResponse.body).payload.credential;
    credentialB = decodeEnrollmentExchangeResponseEnvelope(enrolledBResponse.body).payload.credential;
    invariant(credentialA !== credentialB, 'Enrollment issued the same credential to two principals.');
    expectError(
      await environment.operations.enroll(enrollmentARequest),
      401,
      ErrorCode.AUTH_INVALID,
      'Invitation reuse',
    );
    const protocolResponse = await environment.operations.protocol(credentialA);
    expectStatus(protocolResponse, 200, 'Authenticated protocol request');
    protocolBody = protocolResponse.body;
    const info = negotiateProtocol(decodeProtocolInfoEnvelope(protocolBody).payload, [
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
      invitation_reuse: ErrorCode.AUTH_INVALID,
      protocol_version: info.protocol_version,
    };
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
    const opened = await environment.operations.openStream(credentialA, cubeA, readCursor);
    expectStatus(opened, 200, 'Cursor stream open');
    invariant(opened.stream, 'Successful stream response omitted its AsyncIterable.');
    const reader = new SseEventReader(opened.stream);
    try {
      const replay = logEvent(await within(reader.next(), 'Replay event', streamDeadlineMs), 'Replay');
      invariant(replay.entry.message === 'gamma', 'Stream ignored its cursor or replayed the wrong entry.');
      invariant(compareLogCursor(readCursor, replay.cursor) < 0, 'Replay cursor did not advance.');

      const transition = reader.next();
      const appendDelta = environment.operations.append(
        credentialA,
        cubeA,
        createProtocolEnvelope('append-a4', { message: 'delta' }),
      );
      const bookmark = await within(transition, 'Replay-complete bookmark', streamDeadlineMs);
      invariant(bookmark.type === 'bookmark' && bookmark.replay_complete, 'Stream omitted its replay-complete bookmark.');
      expectStatus(await appendDelta, 201, 'Transition append');

      const delta = logEvent(await within(reader.next(), 'Live delta event', streamDeadlineMs), 'Live transition');
      invariant(delta.entry.message === 'delta', 'Entry appended during replay transition was lost.');
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
    return { status: 410, code: ErrorCode.CURSOR_EXPIRED };
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
    const response = await environment.operations.protocol(
      credentialA,
      ['future.required' as Capability],
    );
    expectError(response, 501, ErrorCode.UNSUPPORTED_CAPABILITY, 'Unsupported capability request');
    return { status: 501, code: ErrorCode.UNSUPPORTED_CAPABILITY };
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
