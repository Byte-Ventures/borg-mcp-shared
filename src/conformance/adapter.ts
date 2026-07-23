import {
  ErrorCode,
  compareLogCursor,
  createProtocolEnvelope,
  decodeCreateCubeResponseEnvelope,
  decodeAppendLogResultEnvelope,
  decodeDecisionResultEnvelope,
  decodeDecisionsResultEnvelope,
  decodeEnrollmentExchangeResponseEnvelope,
  decodeAttachResponseEnvelope,
  decodeDroneRuntimeMetadataPatch,
  decodeEvictDroneResultEnvelope,
  decodeProtocolEnvelope,
  decodeProtocolErrorEnvelope,
  decodeProtocolTagPreflight,
  decodeReadLogResultEnvelope,
  decodeReassignDroneResultEnvelope,
  decodeUpdateDroneRuntimeMetadataResponseEnvelope,
  decodeSseFrames,
  PROTOCOL_LIMIT_CEILINGS,
  PROTOCOL_HTTP_CONTRACT,
  PROTOCOL_VERSION,
  utf8ByteLength,
  type CreateCubeResponse,
  type LogCursor,
  type StreamEvent,
  type DroneRuntimeMetadata,
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

export interface ConformanceRole {
  readonly id: string;
}

export interface ConformanceDrone {
  readonly id: string;
}

export interface ConformanceDroneRuntimeState {
  readonly metadata: DroneRuntimeMetadata;
  readonly metadata_reported: boolean;
  readonly metadata_revision: number;
  readonly cube_id: string;
  readonly role_id: string;
  readonly session_state: 'active' | 'revoked' | 'expired';
  readonly evicted: boolean;
  readonly last_seen: string;
  readonly heartbeat_count: number;
  readonly wake_count: number;
  readonly log_count: number;
  readonly model_turn_count: number;
  readonly grant_access: ConformanceCubeAccess | null;
  readonly server_capabilities: readonly string[];
  readonly principal_revoked: boolean;
  readonly session_bound: boolean;
  readonly last_log_post: string | null;
  readonly last_regen_at: string | null;
  readonly last_read_log_at: string | null;
  readonly last_event_received_at: string | null;
  readonly wake_path: 'live';
  readonly wake_alert: null;
  readonly monitor_armed: boolean;
  readonly sse_connected: boolean;
  readonly claim_count: number;
  readonly decision_count: number;
  readonly routing_eligible: boolean;
}

export type ConformanceCubeAccess = 'read' | 'write' | 'manage';

export interface ConformanceCubeManagementState {
  readonly directive: string;
  readonly taxonomy_marker: string | null;
  readonly role_ids: readonly string[];
  readonly active_decision_ids: readonly string[];
  readonly drones: ReadonlyArray<{
    readonly id: string;
    readonly role_id: string;
    readonly evicted: boolean;
    readonly session_revoked: boolean;
  }>;
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

export interface ConformanceEnrollmentPrincipalState {
  response_client_matches: boolean;
  active_credential_bindings: number;
  /**
   * The principal's currently-bound credential still equals the one it enrolled
   * with. Since the credential-free tag preflight cannot probe credentials, this
   * out-of-band authority check is what proves a rejected mismatch retry did not
   * overwrite the good credential.
   */
  bound_credential_matches_enrollment: boolean;
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
  /** Grants the requested cube authority; omitted access defaults to manage. */
  grantCube(
    principal: ConformancePrincipal,
    cube: ConformanceCube,
    access?: ConformanceCubeAccess,
  ): Promise<void>;
  createRole(cube: ConformanceCube, input: {
    readonly roleClass: 'queen' | 'worker';
    readonly isHumanSeat: boolean;
  }): Promise<ConformanceRole>;
  createDrone(
    principal: ConformancePrincipal,
    cube: ConformanceCube,
    role: ConformanceRole,
  ): Promise<ConformanceDrone>;
  issueManagedDroneSession(drone: ConformanceDrone): Promise<string>;
  revokeManagedDroneSession(drone: ConformanceDrone): Promise<void>;
  expireManagedDroneSession(drone: ConformanceDrone): Promise<void>;
  inspectManagedDrone(drone: ConformanceDrone): Promise<{
    readonly role_id: string;
    readonly evicted: boolean;
    readonly session_revoked: boolean;
  }>;
  inspectDroneRuntimeState(drone: ConformanceDrone): Promise<ConformanceDroneRuntimeState>;
  /** Observes every cube field mutated by a represented manage-scoped operation. */
  inspectCubeManagementState(cube: ConformanceCube): Promise<ConformanceCubeManagementState>;
  grantCreateCubeCapability(principal: ConformancePrincipal): Promise<void>;
  issueDroneSession(principal: ConformancePrincipal): Promise<string>;
  issueSingleUseInvitation(principal: ConformancePrincipal, purpose: 'owner' | 'client'): Promise<string>;
  observeAuthorityState(): Promise<ConformanceAuthorityState>;
  inspectCreatedCube(
    creator: ConformancePrincipal,
    response: CreateCubeResponse,
  ): Promise<ConformanceCreatedCubeState>;
  inspectEnrollmentPrincipal(
    principal: ConformancePrincipal,
    responseClientId: string,
  ): Promise<ConformanceEnrollmentPrincipalState>;
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
  attach(credential: string, request: unknown): Promise<ConformanceHttpResponse>;
  selfMetadataUpdate(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
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
  updateCube(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  createRole(
    credential: string,
    cube: ConformanceCube,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  patchTaxonomy(
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
  listDrones(
    credential: string,
    cube: ConformanceCube,
  ): Promise<ConformanceHttpResponse>;
  reassignDrone(
    credential: string,
    cube: ConformanceCube,
    drone: ConformanceDrone,
    request: unknown,
  ): Promise<ConformanceHttpResponse>;
  evictDrone(
    credential: string,
    cube: ConformanceCube,
    drone: ConformanceDrone,
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
  { id: 'protocol.credential-free-preflight', area: 'protocol' },
  { id: 'enrollment.retry-authority', area: 'enrollment' },
  { id: 'security.adapter-boundary-injection', area: 'security' },
  { id: 'security.oversize-request', area: 'security' },
  { id: 'security.cross-cube-isolation', area: 'security' },
  { id: 'log.read-cursor-tuple', area: 'cursor' },
  { id: 'sse.replay-live-transition', area: 'sse' },
  { id: 'cursor.explicit-expiry', area: 'cursor' },
  { id: 'acks.idempotent', area: 'acks' },
  { id: 'claims.durable-noncursor', area: 'claims' },
  { id: 'decisions.topic-supersession', area: 'decisions' },
  { id: 'security.drone-management-authorization', area: 'security' },
  { id: 'security.manage-access-matrix', area: 'security' },
  { id: 'drones.reassign-invariants', area: 'drones' },
  { id: 'security.cross-cube-drone-management', area: 'security' },
  { id: 'drones.evict-terminal-signal', area: 'drones' },
  { id: 'security.drone-session-rejection-causes', area: 'security' },
  { id: 'metadata.attach-report', area: 'metadata' },
  { id: 'metadata.self-heal-patch', area: 'metadata' },
  { id: 'security.metadata-invalid-atomic', area: 'security' },
  { id: 'security.metadata-own-seat', area: 'security' },
  { id: 'security.metadata-cross-cube-isolation', area: 'security' },
  { id: 'security.metadata-noninterference', area: 'security' },
  { id: 'security.metadata-secret-non-echo', area: 'security' },
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

function listedDroneIds(response: ConformanceHttpResponse): string[] {
  return decodeProtocolEnvelope(response.body, (payload) => {
    invariant(typeof payload === 'object' && payload !== null, 'Roster payload is not an object.');
    const drones = (payload as { drones?: unknown }).drones;
    invariant(Array.isArray(drones), 'Roster payload omitted drones.');
    return drones.map((drone) => {
      invariant(typeof drone === 'object' && drone !== null, 'Roster contains an invalid drone.');
      const id = (drone as { id?: unknown }).id;
      invariant(typeof id === 'string', 'Roster drone omitted its id.');
      return id;
    });
  }).payload;
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
  requests: readonly { invitation: string; retry_key: string; client_credential: string }[],
  description: string,
): void {
  const diagnostic = JSON.stringify(response.body);
  const secrets = new Set(requests.flatMap((request) => [
    request.invitation,
    request.retry_key,
    request.client_credential,
  ]));
  for (const secret of secrets) {
    invariant(!diagnostic.includes(secret), `${description} exposed enrollment retry material.`);
  }
}

function expectSecretFreeError(
  response: ConformanceHttpResponse,
  status: number,
  code: ErrorCode,
  operation: string,
  secrets: readonly string[],
): void {
  expectError(response, status, code, operation);
  const diagnostic = JSON.stringify(response.body);
  for (const secret of new Set(secrets)) {
    invariant(!diagnostic.includes(secret), `${operation} exposed retry material.`);
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
  await record('http.unauthenticated-liveness', async () => {
    const response = await environment.operations.health();
    expectStatus(response, 204, 'Unauthenticated liveness');
    invariant(response.body === '' || response.body === undefined, 'Unauthenticated liveness exposed a response body.');
    return { status: 204, bodyless: true };
  });

  await record('protocol.credential-free-preflight', async () => {
    // The tag preflight is credential-free (no bearer) and mutation-free: a
    // client verifies pinned TLS and the exact tag before it creates or sends any
    // credential. The server must answer 200 with ONLY the exact tag.
    const before = await environment.admin.observeAuthorityState();
    const response = await environment.operations.protocol(null);
    expectStatus(response, 200, 'Credential-free protocol-tag preflight');
    const preflight = decodeProtocolTagPreflight(response.body);
    invariant(
      Object.keys(preflight).length === 1 && preflight.protocol_version === PROTOCOL_VERSION,
      'Protocol-tag preflight exposed more than the exact tag.',
    );
    assertStateDelta(before, await environment.admin.observeAuthorityState(), {}, 'Protocol-tag preflight');
    return { authenticated: false, mutation_free: true, protocol_version: preflight.protocol_version };
  });

  await record('enrollment.retry-authority', async () => {
    const retryVectorErrors: string[] = [];
    for (const [index, vector] of ENROLLMENT_RETRY_CONFORMANCE.entries()) {
      for (const purpose of ['client', 'owner'] as const) {
        await environment.admin.reset();
        try {
          const principal = await environment.admin.createPrincipal(`${purpose}-retry-vector-${index}`);
          const invitation = await environment.admin.issueSingleUseInvitation(principal, purpose);
          const initialPayload = { ...vector.initial, invitation };
          const retryPayload = { ...vector.retry, invitation };
          const beforeInitial = await environment.admin.observeAuthorityState();
          const initialResponse = await environment.operations.enroll(
            createProtocolEnvelope(`retry-${index}-initial`, initialPayload),
          );
          expectStatus(initialResponse, 201, `${vector.name} initial request`);
          const initial = decodeEnrollmentExchangeResponseEnvelope(initialResponse.body).payload;
          invariant(initial.purpose === purpose, `${purpose} ${vector.name} returned the wrong purpose.`);
          invariant(
            same(initial.server_capabilities, purpose === 'owner' ? ['create_cube'] : []),
            `${purpose} ${vector.name} returned incorrect server authority.`,
          );
          const afterInitial = await environment.admin.observeAuthorityState();
          assertStateDelta(
            beforeInitial,
            afterInitial,
            {
              enrolled_clients: 1,
              enrollment_claims: 1,
              server_capabilities: purpose === 'owner' ? 1 : 0,
            },
            `${purpose} ${vector.name} initial request`,
          );

          const beforeRetry = await environment.admin.observeAuthorityState();
          const retryResponse = await environment.operations.enroll(
            createProtocolEnvelope(`retry-${index}-retry`, retryPayload),
          );
          if (vector.expected.outcome === 'stable_non_secret_identity') {
            expectStatus(retryResponse, 201, `${purpose} ${vector.name}`);
            const retry = decodeEnrollmentExchangeResponseEnvelope(retryResponse.body).payload;
            invariant(same(initial, retry), `${purpose} ${vector.name} returned different identities.`);
            for (const field of vector.expected.forbidden_response_fields) {
              invariant(!(field in retry), `${purpose} ${vector.name} returned forbidden field ${field}.`);
            }
          } else {
            expectError(retryResponse, vector.expected.status, ErrorCode.AUTH_INVALID, `${purpose} ${vector.name}`);
            assertEnrollmentErrorIsSecretFree(
              retryResponse,
              [initialPayload, retryPayload],
              `${purpose} ${vector.name}`,
            );
          }
          assertStateDelta(beforeRetry, await environment.admin.observeAuthorityState(), {}, `${purpose} ${vector.name} retry`);
          invariant(
            same(await environment.admin.inspectEnrollmentPrincipal(principal, initial.client_id), {
              response_client_matches: true,
              active_credential_bindings: 1,
              bound_credential_matches_enrollment: true,
            }),
            `${purpose} ${vector.name} changed enrollment binding ownership.`,
          );
        } catch (error) {
          retryVectorErrors.push(
            `${purpose} ${vector.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
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
    const droneCredential = await environment.admin.issueDroneSession(ownerPrincipal);
    const beforeDeniedCreate = await environment.admin.observeAuthorityState();
    expectSecretFreeError(
      await environment.operations.createCube(null, createProtocolEnvelope('cube-missing-auth', cubeRequest)),
      401,
      ErrorCode.AUTH_MISSING,
      'Missing-auth cube create',
      [cubeRequest.retry_key],
    );
    expectSecretFreeError(
      await environment.operations.createCube('invalid-credential', createProtocolEnvelope('cube-invalid-auth', cubeRequest)),
      401,
      ErrorCode.AUTH_INVALID,
      'Invalid-auth cube create',
      [cubeRequest.retry_key],
    );
    expectSecretFreeError(
      await environment.operations.createCube(ordinaryCredential, createProtocolEnvelope('cube-denied', cubeRequest)),
      403,
      ErrorCode.ACCESS_DENIED,
      'Ordinary cube create',
      [cubeRequest.retry_key],
    );
    expectSecretFreeError(
      await environment.operations.createCube(droneCredential, createProtocolEnvelope('cube-drone-denied', cubeRequest)),
      403,
      ErrorCode.ACCESS_DENIED,
      'Drone-session cube create',
      [cubeRequest.retry_key],
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
    expectSecretFreeError(
      await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-mismatch', { ...cubeRequest, name: 'repository-two' })),
      409,
      ErrorCode.INVALID_INPUT,
      'Cube-create retry mismatch',
      [cubeRequest.retry_key],
    );
    assertStateDelta(beforeCreateMismatch, await environment.admin.observeAuthorityState(), {}, 'Cube-create retry mismatch');
    await environment.admin.grantCreateCubeCapability(ordinaryPrincipal);
    const crossClientRequest = { ...cubeRequest, name: 'ordinary-repository' };
    const beforeCrossClientCreate = await environment.admin.observeAuthorityState();
    const crossClientResponse = await environment.operations.createCube(
      ordinaryCredential,
      createProtocolEnvelope('cube-cross-client', crossClientRequest),
    );
    expectStatus(crossClientResponse, 201, 'Cross-client cube create with reused retry key');
    const crossClientCreated = decodeCreateCubeResponseEnvelope(crossClientResponse.body).payload;
    invariant(crossClientCreated.cube_id !== created.cube_id, 'Cross-client retry key reused another client\'s cube.');
    assertStateDelta(
      beforeCrossClientCreate,
      await environment.admin.observeAuthorityState(),
      { cubes: 1, roles: 2, grants: 1, cube_create_bindings: 1 },
      'Cross-client cube create',
    );
    invariant(
      (await environment.admin.inspectCreatedCube(ordinaryPrincipal, crossClientCreated)).creator_has_grant,
      'Cross-client cube creation did not grant its authenticated creator.',
    );
    const beforeCrossClientRetry = await environment.admin.observeAuthorityState();
    const crossClientRetry = await environment.operations.createCube(
      ordinaryCredential,
      createProtocolEnvelope('cube-cross-client-retry', crossClientRequest),
    );
    expectStatus(crossClientRetry, 201, 'Exact cross-client cube-create retry');
    invariant(
      same(decodeCreateCubeResponseEnvelope(crossClientRetry.body).payload, crossClientCreated),
      'Exact cross-client cube-create retry returned different identities.',
    );
    assertStateDelta(beforeCrossClientRetry, await environment.admin.observeAuthorityState(), {}, 'Exact cross-client cube-create retry');
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
    expectSecretFreeError(
      await environment.operations.createCube(ownerCredential, createProtocolEnvelope('cube-revoked', {
        ...cubeRequest,
        retry_key: '00000000-0000-4000-8000-000000000215',
      })),
      401,
      ErrorCode.SESSION_REVOKED,
      'Revoked owner cube create',
      ['00000000-0000-4000-8000-000000000215'],
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
    return {
      enrollment_status: 201,
      exact_retry_status: 201,
      mismatched_retry: ErrorCode.AUTH_INVALID,
      response_secret_free: true,
    };
  });

  await record('security.adapter-boundary-injection', async () => {
    const injectedMessage = "'); DROP TABLE log_entries; --\r\ndata: forged-sse-frame";
    const injectedBody = JSON.stringify(
      createProtocolEnvelope('inject-b1', { message: injectedMessage }),
    );
    invariant(
      utf8ByteLength(injectedBody) <= PROTOCOL_LIMIT_CEILINGS.max_request_bytes &&
        utf8ByteLength(injectedMessage) <= PROTOCOL_LIMIT_CEILINGS.max_log_message_bytes,
      'Injection fixture exceeded the shared request-limit ceiling.',
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
    const baseBody = JSON.stringify(
      createProtocolEnvelope('oversize-a1', { message: 'must-not-persist' }),
    );
    const oversizedBody = baseBody + ' '.repeat(
      Math.max(0, PROTOCOL_LIMIT_CEILINGS.max_request_bytes - utf8ByteLength(baseBody) + 1),
    );
    invariant(
      utf8ByteLength(oversizedBody) > PROTOCOL_LIMIT_CEILINGS.max_request_bytes,
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

  let workerRoleA!: ConformanceRole;
  let workerRoleB!: ConformanceRole;
  let managedWorker!: ConformanceDrone;
  let readCredential = '';
  let writeCredential = '';
  let workerSession = '';
  let metadataDroneA!: ConformanceDrone;
  let metadataDroneB!: ConformanceDrone;
  let metadataSessionA = '';
  await record('security.drone-management-authorization', async () => {
    workerRoleA = await environment.admin.createRole(cubeA, {
      roleClass: 'worker', isHumanSeat: false,
    });
    managedWorker = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const deniedCredentials: Array<{ access: 'read' | 'write'; credential: string }> = [];
    for (const [index, access] of ['read', 'write'].entries()) {
      const principalName = access === 'read' ? 'Coordinator' : 'write-principal';
      const principal = await environment.admin.createPrincipal(principalName);
      await environment.admin.grantCube(principal, cubeA, access as 'read' | 'write');
      const invitation = await environment.admin.issueSingleUseInvitation(principal, 'client');
      const credential = `${(access === 'read' ? 'R' : 'W').repeat(42)}Q`;
      if (access === 'read') readCredential = credential;
      else writeCredential = credential;
      const enrollment = await environment.operations.enroll(createProtocolEnvelope(
        `${access}-principal-enroll`,
        {
          invitation,
          retry_key: `00000000-0000-4000-8000-${String(301 + index).padStart(12, '0')}`,
          client_credential: credential,
          client_name: principalName,
        },
      ));
      expectStatus(enrollment, 201, `${access} principal enrollment`);
      deniedCredentials.push({ access: access as 'read' | 'write', credential });
    }
    for (const { access, credential } of deniedCredentials) {
      expectError(
        await environment.operations.reassignDrone(
          credential,
          cubeA,
          managedWorker,
          createProtocolEnvelope(`${access}-reassign-denied`, { role_id: workerRoleA.id }),
        ),
        403,
        ErrorCode.ACCESS_DENIED,
        `${access} principal reassignment`,
      );
      expectError(
        await environment.operations.evictDrone(
          credential,
          cubeA,
          managedWorker,
          createProtocolEnvelope(`${access}-evict-denied`, {}),
        ),
        403,
        ErrorCode.ACCESS_DENIED,
        `${access} principal eviction`,
      );
    }
    return { read_status: 403, write_status: 403, manage_required: true };
  });

  await record('security.manage-access-matrix', async () => {
    const noGrantPrincipal = await environment.admin.createPrincipal('Coordinator role without cube grant');
    const noGrantInvitation = await environment.admin.issueSingleUseInvitation(noGrantPrincipal, 'client');
    const noGrantCredential = `${'N'.repeat(42)}Q`;
    expectStatus(await environment.operations.enroll(createProtocolEnvelope(
      'no-grant-principal-enroll',
      {
        invitation: noGrantInvitation,
        retry_key: '00000000-0000-4000-8000-000000000303',
        client_credential: noGrantCredential,
        client_name: 'Coordinator',
      },
    )), 201, 'No-grant principal enrollment');

    const droneCredential = await environment.admin.issueManagedDroneSession(managedWorker);
    const matrixTargetRole = await environment.admin.createRole(cubeA, {
      roleClass: 'worker', isHumanSeat: false,
    });
    const evictionTarget = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    await environment.admin.issueManagedDroneSession(evictionTarget);
    const unknownCube = { id: '00000000-0000-4000-8000-000000000399' };
    const snapshot = async (): Promise<unknown> => ({
      cubeA: await environment.admin.inspectCubeManagementState(cubeA),
      cubeB: await environment.admin.inspectCubeManagementState(cubeB),
    });
    const operations: ReadonlyArray<{
      name: string;
      successStatus: number;
      invoke: (credential: string, cube: ConformanceCube) => Promise<ConformanceHttpResponse>;
    }> = [
      {
        name: 'cube-update',
        successStatus: 200,
        invoke: (credential, cube) => environment.operations.updateCube(
          credential,
          cube,
          createProtocolEnvelope('matrix-cube-update', { cube_directive: 'matrix-directive' }),
        ),
      },
      {
        name: 'role-create',
        successStatus: 201,
        invoke: (credential, cube) => environment.operations.createRole(
          credential,
          cube,
          createProtocolEnvelope('matrix-role-create', { name: 'Matrix Role' }),
        ),
      },
      {
        name: 'taxonomy-patch',
        successStatus: 200,
        invoke: (credential, cube) => environment.operations.patchTaxonomy(
          credential,
          cube,
          createProtocolEnvelope('matrix-taxonomy-patch', { marker: 'matrix-taxonomy' }),
        ),
      },
      {
        name: 'decision-record',
        successStatus: 201,
        invoke: (credential, cube) => environment.operations.recordDecision(
          credential,
          cube,
          createProtocolEnvelope('matrix-decision-record', {
            topic: 'matrix-authority', decision: 'manage only',
          }),
        ),
      },
      {
        name: 'drone-reassign',
        successStatus: 200,
        invoke: (credential, cube) => environment.operations.reassignDrone(
          credential,
          cube,
          managedWorker,
          createProtocolEnvelope('matrix-drone-reassign', { role_id: matrixTargetRole.id }),
        ),
      },
      {
        name: 'drone-evict',
        successStatus: 200,
        invoke: (credential, cube) => environment.operations.evictDrone(
          credential,
          cube,
          evictionTarget,
          createProtocolEnvelope('matrix-drone-evict', {}),
        ),
      },
    ];

    for (const operation of operations) {
      for (const [kind, credential] of [
        ['read', readCredential],
        ['write', writeCredential],
        ['drone-session', droneCredential],
      ] as const) {
        const before = await snapshot();
        expectError(
          await operation.invoke(credential, cubeA),
          403,
          ErrorCode.ACCESS_DENIED,
          `${operation.name} by ${kind} principal`,
        );
        invariant(same(await snapshot(), before), `${operation.name} mutated state after ${kind} denial.`);
      }
      for (const [kind, credential, cube] of [
        ['no-grant', noGrantCredential, cubeA],
        ['foreign-principal', credentialB, cubeA],
        ['foreign-cube', credentialA, cubeB],
        ['unknown-cube', credentialA, unknownCube],
      ] as const) {
        const before = await snapshot();
        expectError(
          await operation.invoke(credential, cube),
          404,
          ErrorCode.NOT_FOUND,
          `${operation.name} against ${kind}`,
        );
        invariant(same(await snapshot(), before), `${operation.name} mutated state after ${kind} denial.`);
      }
      const beforeSuccess = await environment.admin.inspectCubeManagementState(cubeA);
      const success = await operation.invoke(credentialA, cubeA);
      expectStatus(success, operation.successStatus, `${operation.name} by managing principal`);
      invariant(
        !same(await environment.admin.inspectCubeManagementState(cubeA), beforeSuccess),
        `${operation.name} managing success did not mutate its declared state.`,
      );
    }
    return {
      operation_count: operations.length,
      manage_success: true,
      read_write_status: 403,
      drone_session_status: 403,
      hidden_status: 404,
      denied_mutations: 0,
      role_labels_authoritative: false,
    };
  });

  await record('drones.reassign-invariants', async () => {
    workerRoleB = await environment.admin.createRole(cubeA, {
      roleClass: 'worker', isHumanSeat: false,
    });
    const humanSourceRole = await environment.admin.createRole(cubeA, {
      roleClass: 'worker', isHumanSeat: true,
    });
    const queenRole = await environment.admin.createRole(cubeA, {
      roleClass: 'queen', isHumanSeat: false,
    });
    const occupiedHumanRole = await environment.admin.createRole(cubeA, {
      roleClass: 'worker', isHumanSeat: true,
    });
    const humanSource = await environment.admin.createDrone(principalA, cubeA, humanSourceRole);
    await environment.admin.createDrone(principalA, cubeA, occupiedHumanRole);
    const contender = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    workerSession = await environment.admin.issueManagedDroneSession(managedWorker);

    const reassigned = await environment.operations.reassignDrone(
      credentialA,
      cubeA,
      managedWorker,
      createProtocolEnvelope('reassign-worker', { role_id: workerRoleB.id }),
    );
    expectStatus(reassigned, 200, 'Worker reassignment');
    const reassignedDrone = decodeReassignDroneResultEnvelope(reassigned.body).payload.drone;
    invariant(
      reassignedDrone.id === managedWorker.id && reassignedDrone.role_id === workerRoleB.id,
      'Reassignment response did not identify the persisted target role.',
    );

    expectError(
      await environment.operations.reassignDrone(
        workerSession,
        cubeA,
        managedWorker,
        createProtocolEnvelope('reassign-drone-session-denied', { role_id: workerRoleA.id }),
      ),
      403,
      ErrorCode.ACCESS_DENIED,
      'Drone-session reassignment',
    );
    expectError(
      await environment.operations.reassignDrone(
        credentialA,
        cubeA,
        managedWorker,
        createProtocolEnvelope('reassign-queen-denied', { role_id: queenRole.id }),
      ),
      403,
      ErrorCode.ACCESS_DENIED,
      'Worker-to-queen reassignment',
    );
    const promoted = await environment.operations.reassignDrone(
      credentialA,
      cubeA,
      humanSource,
      createProtocolEnvelope('reassign-queen-allowed', { role_id: queenRole.id }),
    );
    expectStatus(promoted, 200, 'Human-seat-to-queen reassignment');
    invariant(
      decodeReassignDroneResultEnvelope(promoted.body).payload.drone.role_id === queenRole.id,
      'Human-seat-to-queen reassignment did not persist.',
    );
    expectError(
      await environment.operations.reassignDrone(
        credentialA,
        cubeA,
        contender,
        createProtocolEnvelope('reassign-occupied-denied', { role_id: occupiedHumanRole.id }),
      ),
      409,
      ErrorCode.ROLE_IN_USE,
      'Occupied human-seat reassignment',
    );
    return {
      worker_reassigned: true,
      drone_session_denied: true,
      queen_requires_human_seat: true,
      occupied_human_seat_denied: true,
    };
  });

  await record('security.cross-cube-drone-management', async () => {
    const foreignRole = await environment.admin.createRole(cubeB, {
      roleClass: 'worker', isHumanSeat: false,
    });
    const foreignDrone = await environment.admin.createDrone(principalB, cubeB, foreignRole);
    expectError(
      await environment.operations.reassignDrone(
        credentialA,
        cubeB,
        foreignDrone,
        createProtocolEnvelope('cross-cube-reassign', { role_id: foreignRole.id }),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Cross-cube reassignment',
    );
    expectError(
      await environment.operations.evictDrone(
        credentialA,
        cubeB,
        foreignDrone,
        createProtocolEnvelope('cross-cube-evict', {}),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Cross-cube eviction',
    );
    expectError(
      await environment.operations.reassignDrone(
        credentialA,
        cubeA,
        foreignDrone,
        createProtocolEnvelope('foreign-drone-local-route', { role_id: workerRoleA.id }),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Foreign drone reassignment through authorized cube route',
    );
    expectError(
      await environment.operations.evictDrone(
        credentialA,
        cubeA,
        foreignDrone,
        createProtocolEnvelope('foreign-drone-local-evict', {}),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Foreign drone eviction through authorized cube route',
    );
    expectError(
      await environment.operations.reassignDrone(
        credentialA,
        cubeA,
        managedWorker,
        createProtocolEnvelope('foreign-role-local-drone', { role_id: foreignRole.id }),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Foreign role reassignment through authorized cube route',
    );
    await environment.admin.grantCube(principalA, cubeB, 'read');
    const foreignDroneBefore = await environment.admin.inspectManagedDrone(foreignDrone);
    expectError(
      await environment.operations.reassignDrone(
        workerSession,
        cubeB,
        foreignDrone,
        createProtocolEnvelope('bound-drone-cross-cube-reassign', { role_id: foreignRole.id }),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Bound drone cross-cube reassignment',
    );
    invariant(
      same(await environment.admin.inspectManagedDrone(foreignDrone), foreignDroneBefore),
      'Bound drone cross-cube reassignment mutated the foreign target.',
    );
    expectError(
      await environment.operations.evictDrone(
        workerSession,
        cubeB,
        foreignDrone,
        createProtocolEnvelope('bound-drone-cross-cube-evict', {}),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Bound drone cross-cube eviction',
    );
    invariant(
      same(await environment.admin.inspectManagedDrone(foreignDrone), foreignDroneBefore),
      'Bound drone cross-cube eviction mutated the foreign target.',
    );
    return {
      unauthorized_cube_status: 404,
      foreign_drone_status: 404,
      foreign_role_status: 404,
      bound_drone_cross_cube_status: 404,
      code: ErrorCode.NOT_FOUND,
    };
  });

  await record('drones.evict-terminal-signal', async () => {
    const evictedDrone = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const evictedCredential = await environment.admin.issueManagedDroneSession(evictedDrone);
    expectStatus(
      await environment.operations.read(
        evictedCredential,
        cubeA,
        createProtocolEnvelope('evict-probe-before', { cursor: null, limit: 1 }),
      ),
      200,
      'Pre-eviction seat probe',
    );
    const before = await environment.operations.listDrones(credentialA, cubeA);
    expectStatus(before, 200, 'Pre-eviction roster');
    invariant(listedDroneIds(before).includes(evictedDrone.id), 'Active drone was absent from roster.');

    const evicted = await environment.operations.evictDrone(
      credentialA,
      cubeA,
      evictedDrone,
      createProtocolEnvelope('evict-managed-drone', {}),
    );
    expectStatus(evicted, 200, 'Drone eviction');
    invariant(
      same(decodeEvictDroneResultEnvelope(evicted.body).payload, {
        drone_id: evictedDrone.id,
        evicted: true,
      }),
      'Eviction response did not identify the terminal seat.',
    );
    invariant(
      same(await environment.admin.inspectManagedDrone(evictedDrone), {
        role_id: workerRoleA.id,
        evicted: true,
        session_revoked: true,
      }),
      'Eviction did not atomically mark the drone evicted and revoke its session.',
    );
    const after = await environment.operations.listDrones(credentialA, cubeA);
    expectStatus(after, 200, 'Post-eviction roster');
    invariant(!listedDroneIds(after).includes(evictedDrone.id), 'Evicted drone remained in roster.');
    expectError(
      await environment.operations.append(
        credentialA,
        cubeA,
        createProtocolEnvelope('evict-direct-target', {
          message: 'must-not-fan-out',
          visibility: 'direct',
          recipientDroneIds: [evictedDrone.id],
        }),
      ),
      404,
      ErrorCode.NOT_FOUND,
      'Evicted direct recipient',
    );
    expectError(
      await environment.operations.read(
        evictedCredential,
        cubeA,
        createProtocolEnvelope('evict-probe-after', { cursor: null, limit: 1 }),
      ),
      PROTOCOL_HTTP_CONTRACT.drone_evicted_status,
      ErrorCode.DRONE_EVICTED,
      'Evicted seat probe',
    );
    return {
      eviction_status: 200,
      roster_visible: false,
      fanout_reachable: false,
      old_bearer_status: 410,
      old_bearer_code: ErrorCode.DRONE_EVICTED,
    };
  });

  await record('security.drone-session-rejection-causes', async () => {
    const revokedDrone = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const expiredDrone = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const revokedCredential = await environment.admin.issueManagedDroneSession(revokedDrone);
    const expiredCredential = await environment.admin.issueManagedDroneSession(expiredDrone);
    await environment.admin.revokeManagedDroneSession(revokedDrone);
    await environment.admin.expireManagedDroneSession(expiredDrone);
    for (const [label, credential, code] of [
      ['revoked', revokedCredential, ErrorCode.SESSION_REVOKED],
      ['expired', expiredCredential, ErrorCode.AUTH_EXPIRED],
    ] as const) {
      expectError(
        await environment.operations.read(
          credential,
          cubeA,
          createProtocolEnvelope(`${label}-seat-probe`, { cursor: null, limit: 1 }),
        ),
        401,
        code,
        `${label} seat probe`,
      );
    }
    return {
      revoked_status: 401,
      expired_status: 401,
      revoked_code: ErrorCode.SESSION_REVOKED,
      expired_code: ErrorCode.AUTH_EXPIRED,
    };
  });

  const knownMetadata = {
    agent_kind: 'opencode' as const,
    reported_model: 'openai/gpt-5.6-sol',
    working_repo_name: 'Byte-Ventures/borg-mcp',
    working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp',
  };
  await record('metadata.attach-report', async () => {
    metadataSessionA = 'M'.repeat(43);
    const created = await environment.operations.attach(
      credentialA,
      createProtocolEnvelope('metadata-attach-created', {
        cube_id: cubeA.id,
        role_id: workerRoleA.id,
        session_credential: metadataSessionA,
        runtime_metadata: {
          ...knownMetadata,
          working_repo_origin: 'git@github.com:Byte-Ventures/borg-mcp.git',
        },
      }),
    );
    expectStatus(created, 200, 'Metadata attach create');
    const createdPayload = decodeAttachResponseEnvelope(created.body).payload;
    invariant(createdPayload.result === 'created', 'First metadata attach did not create a seat.');
    invariant(same(createdPayload.drone.runtime_metadata, knownMetadata), 'Attach did not echo canonical metadata.');
    invariant(createdPayload.drone.runtime_metadata_reported, 'Present attach report was not marked reported.');
    metadataDroneA = { id: createdPayload.drone.id };

    const unavailableSession = 'N'.repeat(43);
    const unavailable = await environment.operations.attach(
      credentialA,
      createProtocolEnvelope('metadata-attach-unavailable', {
        cube_id: cubeA.id,
        role_id: workerRoleA.id,
        session_credential: unavailableSession,
      }),
    );
    expectStatus(unavailable, 200, 'Unavailable metadata attach');
    const unavailableDrone = decodeAttachResponseEnvelope(unavailable.body).payload.drone;
    invariant(
      same(unavailableDrone.runtime_metadata, {
        agent_kind: null,
        reported_model: null,
        working_repo_name: null,
        working_repo_origin: null,
      }),
      'Omitted attach report synthesized metadata.',
    );
    invariant(!unavailableDrone.runtime_metadata_reported, 'Omitted attach report was marked reported.');

    const explicitUnknown = await environment.operations.attach(
      credentialA,
      createProtocolEnvelope('metadata-attach-explicit-unknown', {
        cube_id: cubeA.id,
        role_id: workerRoleA.id,
        session_credential: 'U'.repeat(43),
        runtime_metadata: {
          agent_kind: null,
          reported_model: null,
          working_repo_name: null,
          working_repo_origin: null,
        },
      }),
    );
    expectStatus(explicitUnknown, 200, 'Explicit unknown metadata attach');
    const explicitUnknownDrone = decodeAttachResponseEnvelope(explicitUnknown.body).payload.drone;
    invariant(explicitUnknownDrone.runtime_metadata_reported, 'All-null attach report was not marked reported.');

    const reused = await environment.operations.attach(
      credentialA,
      createProtocolEnvelope('metadata-attach-reused', {
        cube_id: cubeA.id,
        role_id: workerRoleA.id,
        prior_drone_id: metadataDroneA.id,
        session_credential: metadataSessionA,
        runtime_metadata: knownMetadata,
      }),
    );
    expectStatus(reused, 200, 'Metadata attach reuse');
    invariant(decodeAttachResponseEnvelope(reused.body).payload.result === 'reused', 'Prior seat was not reused.');
    const cleared = await environment.operations.selfMetadataUpdate(
      metadataSessionA,
      cubeA,
      createProtocolEnvelope('metadata-clear-all', {
        agent_kind: null,
        reported_model: null,
        working_repo_name: null,
        working_repo_origin: null,
      }),
    );
    expectStatus(cleared, 200, 'Clear-all metadata patch');
    const clearedPayload = decodeUpdateDroneRuntimeMetadataResponseEnvelope(cleared.body).payload;
    invariant(clearedPayload.runtime_metadata_reported, 'Clear-all patch lost reported state.');
    invariant(
      same(clearedPayload.runtime_metadata, explicitUnknownDrone.runtime_metadata),
      'Clear-all patch did not produce explicit unknown metadata.',
    );
    expectStatus(
      await environment.operations.selfMetadataUpdate(
        metadataSessionA,
        cubeA,
        createProtocolEnvelope('metadata-restore-known', knownMetadata),
      ),
      200,
      'Restore known metadata',
    );
    return {
      created: true,
      reused: true,
      report_states: [
        unavailableDrone.runtime_metadata_reported,
        explicitUnknownDrone.runtime_metadata_reported,
        clearedPayload.runtime_metadata_reported,
      ],
      canonical_response: true,
    };
  });

  await record('metadata.self-heal-patch', async () => {
    const updates = [
      { request_id: 'metadata-known-new', patch: { reported_model: 'openai/gpt-5.6-terra' } },
      { request_id: 'metadata-null-clear', patch: { reported_model: null } },
      { request_id: 'metadata-null-repeat', patch: { reported_model: null } },
      { request_id: 'metadata-same-value', patch: { agent_kind: 'opencode' as const } },
    ];
    for (const update of updates) {
      const response = await environment.operations.selfMetadataUpdate(
        metadataSessionA,
        cubeA,
        createProtocolEnvelope(update.request_id, update.patch),
      );
      expectStatus(response, 200, update.request_id);
      decodeUpdateDroneRuntimeMetadataResponseEnvelope(response.body);
    }
    const state = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
    invariant(state.metadata.reported_model === null, 'Explicit null did not clear model metadata.');
    invariant(state.metadata.agent_kind === 'opencode', 'Omitted field was not preserved.');
    return { known_replace: true, omitted_unchanged: true, null_clear: true, repeat_safe: true };
  });

  await record('security.metadata-invalid-atomic', async () => {
    const invalidPatches: unknown[] = [
      {},
      { agent_kind: 'OpenCode' },
      { reported_model: '' },
      { reported_model: 'a'.repeat(161) },
      { reported_model: 'safe\u001b[2J' },
      { reported_model: 'safe\u061cnext' },
      { working_repo_name: 'owner/repo' },
      { working_repo_name: 'owner/repo', working_repo_origin: 'https://user:secret@github.com/owner/repo' },
      {
        working_repo_name: 'owner/repo',
        working_repo_origin: ['file:/', '', 'Users', 'secret', 'repo'].join('/'),
      },
      { role_id: workerRoleA.id },
      { last_seen: '2026-07-14T10:00:00.000Z' },
    ];
    for (const [index, patch] of invalidPatches.entries()) {
      const before = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
      const response = await environment.operations.selfMetadataUpdate(
        metadataSessionA,
        cubeA,
        createProtocolEnvelope(`metadata-invalid-${index}`, patch),
      );
      expectError(response, 400, ErrorCode.INVALID_INPUT, `Invalid metadata patch ${index}`);
      invariant(
        same(await environment.admin.inspectDroneRuntimeState(metadataDroneA), before),
        `Invalid metadata patch ${index} partially mutated state.`,
      );
    }
    return { cases: invalidPatches.length, atomic: true, prior_safe_state_retained: true };
  });

  await record('security.metadata-own-seat', async () => {
    const peer = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const peerBefore = await environment.admin.inspectDroneRuntimeState(peer);
    const managedBefore = await environment.admin.inspectDroneRuntimeState(managedWorker);
    const ownBefore = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
    const response = await environment.operations.selfMetadataUpdate(
      metadataSessionA,
      cubeA,
      createProtocolEnvelope('metadata-own-seat', { agent_kind: 'claude' }),
    );
    expectStatus(response, 200, 'Own-seat metadata update');
    invariant(
      same(await environment.admin.inspectDroneRuntimeState(peer), peerBefore),
      'Own-seat update mutated a peer seat.',
    );
    invariant(
      same(await environment.admin.inspectDroneRuntimeState(managedWorker), managedBefore),
      'Own-seat update mutated another existing seat.',
    );
    invariant(
      (await environment.admin.inspectDroneRuntimeState(metadataDroneA)).role_id === ownBefore.role_id,
      'Metadata update changed the current seat role.',
    );
    expectError(
      await environment.operations.selfMetadataUpdate(
        credentialA,
        cubeA,
        createProtocolEnvelope('metadata-manager-denied', { agent_kind: 'codex' }),
      ),
      403,
      ErrorCode.ACCESS_DENIED,
      'Manager metadata update',
    );
    expectError(
      await environment.operations.selfMetadataUpdate(
        'Z'.repeat(43),
        cubeA,
        createProtocolEnvelope('metadata-invalid-session', { agent_kind: null }),
      ),
      401,
      ErrorCode.AUTH_INVALID,
      'Unknown metadata session',
    );
    const rejectedStates: Array<[string, ConformanceDrone, string, number, ErrorCode]> = [];
    const revoked = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const revokedSession = await environment.admin.issueManagedDroneSession(revoked);
    await environment.admin.revokeManagedDroneSession(revoked);
    rejectedStates.push(['revoked', revoked, revokedSession, 401, ErrorCode.SESSION_REVOKED]);
    const expired = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const expiredSession = await environment.admin.issueManagedDroneSession(expired);
    await environment.admin.expireManagedDroneSession(expired);
    rejectedStates.push(['expired', expired, expiredSession, 401, ErrorCode.AUTH_EXPIRED]);
    const evicted = await environment.admin.createDrone(principalA, cubeA, workerRoleA);
    const evictedSession = await environment.admin.issueManagedDroneSession(evicted);
    expectStatus(
      await environment.operations.evictDrone(
        credentialA,
        cubeA,
        evicted,
        createProtocolEnvelope('metadata-evict-seat', {}),
      ),
      200,
      'Metadata seat eviction',
    );
    rejectedStates.push(['evicted', evicted, evictedSession, 410, ErrorCode.DRONE_EVICTED]);
    for (const [label, drone, session, status, code] of rejectedStates) {
      const before = await environment.admin.inspectDroneRuntimeState(drone);
      expectError(
        await environment.operations.selfMetadataUpdate(
          session,
          cubeA,
          createProtocolEnvelope(`metadata-${label}-denied`, { agent_kind: null }),
        ),
        status,
        code,
        `${label} metadata session`,
      );
      invariant(
        same(await environment.admin.inspectDroneRuntimeState(drone), before),
        `${label} metadata denial mutated state.`,
      );
    }
    return {
      own_seat_only: true,
      manager_denied: true,
      unknown_session_denied: true,
      revoked_expired_evicted_denied: true,
    };
  });

  await record('security.metadata-cross-cube-isolation', async () => {
    const sessionB = 'P'.repeat(43);
    const metadataRoleB = await environment.admin.createRole(cubeB, {
      roleClass: 'worker', isHumanSeat: false,
    });
    const attachedB = await environment.operations.attach(
      credentialB,
      createProtocolEnvelope('metadata-attach-b', {
        cube_id: cubeB.id,
        role_id: metadataRoleB.id,
        session_credential: sessionB,
        runtime_metadata: {
          agent_kind: 'codex',
          reported_model: null,
          working_repo_name: 'Byte-Ventures/borg-mcp-server',
          working_repo_origin: 'https://github.com/Byte-Ventures/borg-mcp-server',
        },
      }),
    );
    expectStatus(attachedB, 200, 'Cube B metadata attach');
    metadataDroneB = { id: decodeAttachResponseEnvelope(attachedB.body).payload.drone.id };
    const beforeB = await environment.admin.inspectDroneRuntimeState(metadataDroneB);
    const foreign = await environment.operations.selfMetadataUpdate(
      metadataSessionA,
      cubeB,
      createProtocolEnvelope('metadata-cross-cube', { reported_model: 'foreign/probe' }),
    );
    expectError(foreign, 404, ErrorCode.NOT_FOUND, 'Cross-cube metadata update');
    const unknown = await environment.operations.selfMetadataUpdate(
      metadataSessionA,
      { id: '90000000-0000-4000-8000-000000000001' },
      createProtocolEnvelope('metadata-unknown-cube', { reported_model: 'foreign/probe' }),
    );
    expectError(unknown, 404, ErrorCode.NOT_FOUND, 'Unknown-cube metadata update');
    invariant(same(foreign.body, unknown.body), 'Foreign and unknown metadata probes were distinguishable.');
    invariant(
      same(await environment.admin.inspectDroneRuntimeState(metadataDroneB), beforeB),
      'Cross-cube metadata update mutated the foreign seat.',
    );
    const listedA = await environment.operations.listDrones(credentialA, cubeA);
    invariant(!listedDroneIds(listedA).includes(metadataDroneB.id), 'Cube A roster disclosed cube B metadata seat.');
    return { update_status: 404, foreign_unknown_indistinguishable: true, foreign_unchanged: true, roster_isolated: true };
  });

  await record('security.metadata-noninterference', async () => {
    const before = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
    for (const [requestId, patch] of [
      ['metadata-noninterference-known', { reported_model: 'openai/gpt-5.6-sol' }],
      ['metadata-noninterference-repeat', { reported_model: 'openai/gpt-5.6-sol' }],
      ['metadata-noninterference-null', { reported_model: null }],
    ] as const) {
      expectStatus(
        await environment.operations.selfMetadataUpdate(
          metadataSessionA,
          cubeA,
          createProtocolEnvelope(requestId, patch),
        ),
        200,
        requestId,
      );
    }
    expectError(
      await environment.operations.selfMetadataUpdate(
        metadataSessionA,
        cubeA,
        createProtocolEnvelope('metadata-noninterference-reject', { authority: 'manage' }),
      ),
      400,
      ErrorCode.INVALID_INPUT,
      'Rejected metadata non-interference update',
    );
    const reattached = await environment.operations.attach(
      credentialA,
      createProtocolEnvelope('metadata-noninterference-reattach', {
        cube_id: cubeA.id,
        role_id: workerRoleA.id,
        prior_drone_id: metadataDroneA.id,
        session_credential: metadataSessionA,
      }),
    );
    expectStatus(reattached, 200, 'Metadata non-interference reattach');
    const after = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
    const { metadata: _beforeMetadata, metadata_revision: _beforeRevision, ...beforeInvariant } = before;
    const { metadata: _afterMetadata, metadata_revision: _afterRevision, ...afterInvariant } = after;
    invariant(same(beforeInvariant, afterInvariant), 'Metadata update changed authority/liveness/log state.');
    return {
      authority_unchanged: true,
      role_unchanged: true,
      liveness_unchanged: true,
      logs_unchanged: true,
      model_turns_unchanged: true,
    };
  });

  await record('security.metadata-secret-non-echo', async () => {
    const marker = 'SECRET-METADATA-MARKER';
    const before = await environment.admin.inspectDroneRuntimeState(metadataDroneA);
    const response = await environment.operations.selfMetadataUpdate(
      metadataSessionA,
      cubeA,
      createProtocolEnvelope('metadata-secret', {
        working_repo_name: 'owner/repo',
        working_repo_origin: `https://user:${marker}@github.com/owner/repo?token=${marker}`,
      }),
    );
    expectError(response, 400, ErrorCode.INVALID_INPUT, 'Secret-bearing metadata update');
    invariant(!JSON.stringify(response.body).includes(marker), 'Metadata error echoed hostile secret input.');
    invariant(
      same(await environment.admin.inspectDroneRuntimeState(metadataDroneA), before),
      'Secret-bearing metadata input was persisted.',
    );
    const hostileKeys = [
      'SECRET-METADATA-KEY-MARKER',
      `control\u001b[2J`,
      `bidi\u061cmarker`,
      `token_${'a'.repeat(48)}`,
    ];
    for (const [index, key] of hostileKeys.entries()) {
      const rejected = await environment.operations.selfMetadataUpdate(
        metadataSessionA,
        cubeA,
        createProtocolEnvelope(`metadata-secret-key-${index}`, { [key]: 'x' }),
      );
      expectError(rejected, 400, ErrorCode.INVALID_INPUT, `Hostile metadata key ${index}`);
      invariant(!JSON.stringify(rejected.body).includes(key), `Metadata error echoed hostile key ${index}.`);
    }
    const logs = await environment.operations.read(
      credentialA,
      cubeA,
      createProtocolEnvelope('metadata-secret-log-read', { cursor: null, limit: 500 }),
    );
    expectStatus(logs, 200, 'Metadata secret log read');
    for (const hostile of [marker, ...hostileKeys]) {
      invariant(!JSON.stringify(logs.body).includes(hostile), 'Metadata input leaked into activity logs.');
    }
    return {
      rejected_pre_persistence: true,
      response_secret_free: true,
      state_secret_free: true,
      log_secret_free: true,
      unknown_key_secret_free: true,
    };
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
