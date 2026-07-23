import { describe, expect, it } from 'vitest';
import {
  ADAPTER_CONFORMANCE_FIXTURES,
  ErrorCode,
  ProtocolContractError,
  compareLogCursor,
  createProtocolEnvelope,
  createProtocolTagPreflight,
  decodeAckLogRequest,
  decodeAppendLogRequest,
  decodeEnrollmentExchangeRequestEnvelope,
  decodeAttachRequestEnvelope,
  decodeCreateCubeRequestEnvelope,
  decodeDroneRuntimeMetadataPatch,
  decodeEvictDroneRequestEnvelope,
  decodeProtocolEnvelope,
  decodeReadLogRequest,
  decodeReassignDroneRequestEnvelope,
  decodeRecordDecisionRequest,
  encodeSseEvent,
  runAdapterConformance,
  utf8ByteLength,
  type ConformanceCube,
  type ConformanceCubeAccess,
  type ConformanceEnvironment,
  type ConformanceDrone,
  type ConformanceHttpResponse,
  type ConformancePrincipal,
  type ConformanceRole,
  type ConformanceStreamResponse,
  type Decision,
  type EnrichedStreamEntry,
  type LogCursor,
  type ReadLogClaim,
  type DroneRuntimeMetadata,
} from '../src/index.js';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type Fault =
  | 'cross-cube-leak'
  | 'ignore-stream-cursor'
  | 'drop-transition-write'
  | 'keep-stream-after-revoke'
  | 'interpret-injection-input'
  | 'accept-oversize-request'
  | 'accept-retry-key-mismatch'
  | 'accept-credential-mismatch'
  | 'accept-client-name-mismatch'
  | 'leak-retry-diagnostic'
  | 'mutate-exact-enrollment-retry'
  | 'grant-ordinary-create-cube'
  | 'create-state-during-owner-enrollment'
  | 'omit-owner-create-cube'
  | 'allow-ordinary-cube-create'
  | 'duplicate-exact-cube-retry'
  | 'grant-created-cube-to-wrong-client'
  | 'swap-created-role-identities'
  | 'overwrite-credential-on-reject'
  | 'owner-only-overwrite-on-reject'
  | 'owner-only-accept-mismatch'
  | 'owner-only-retry-mutation'
  | 'global-cube-retry-binding'
  | 'allow-drone-cube-create'
  | 'leak-original-invitation'
  | 'leak-original-retry-key'
  | 'leak-original-credential'
  | 'leak-cube-retry-diagnostic'
  | 'allow-worker-queen-promotion'
  | 'allow-occupied-human-seat'
  | 'allow-cross-cube-drone-management'
  | 'collapse-eviction-signal'
  | 'keep-evicted-drone-visible'
  | 'keep-evicted-drone-routable'
  | 'allow-non-manage-drone-management'
  | 'allow-cross-cube-drone-target'
  | 'allow-cross-cube-role-target'
  | 'skip-eviction-session-revocation'
  | 'hide-known-manage-denial'
  | 'reveal-unknown-manage-denial'
  | 'revoke-session-on-eviction-denial'
  | 'reveal-cross-cube-drone-session'
  | 'collapse-session-expiry'
  | 'metadata-cross-seat-write'
  | 'metadata-partial-invalid-write'
  | 'metadata-derived-role-mutation'
  | 'metadata-raw-echo';

interface PrincipalState {
  handle: ConformancePrincipal;
  grants: Map<string, ConformanceCubeAccess>;
  credential: string | null;
  droneCredential: string | null;
  revoked: boolean;
  serverCapabilities: Set<'create_cube'>;
}

interface CubeState {
  handle: ConformanceCube;
  directive: string;
  taxonomyMarker: string | null;
  entries: EnrichedStreamEntry[];
  claims: ReadLogClaim[];
  decisions: Decision[];
  expired: Set<string>;
  roles: Map<string, RoleState>;
  drones: Map<string, DroneState>;
}

interface RoleState {
  handle: ConformanceRole;
  roleClass: 'queen' | 'worker';
  isHumanSeat: boolean;
  templateKind?: 'human_seat' | 'default_worker';
}

interface DroneState {
  handle: ConformanceDrone;
  principalId: string;
  cubeId: string;
  roleId: string;
  label: string;
  credential: string | null;
  sessionState: 'active' | 'revoked' | 'expired';
  evicted: boolean;
  metadata: DroneRuntimeMetadata;
  metadataReported: boolean;
  metadataRevision: number;
  lastSeen: string;
  heartbeatCount: number;
  wakeCount: number;
  modelTurnCount: number;
}

class AsyncQueue implements AsyncIterable<string> {
  private values: string[] = [];
  private waiters: Array<(result: IteratorResult<string>) => void> = [];
  private closed = false;

  push(value: string): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        const value = this.values.shift();
        if (value !== undefined) return { done: false as const, value };
        if (this.closed) return { done: true as const, value: undefined };
        return new Promise<IteratorResult<string>>((resolve) => this.waiters.push(resolve));
      },
      return: async () => {
        this.close();
        return { done: true as const, value: undefined };
      },
    };
  }
}

class MemoryConformanceEnvironment implements ConformanceEnvironment {
  private readonly limits = {
    max_request_bytes: 65_536,
    max_log_message_bytes: 10_240,
    max_read_page_size: 500,
    max_replay_page_size: 200,
  } as const;
  private principals = new Map<string, PrincipalState>();
  private cubes = new Map<string, CubeState>();
  private invitations = new Map<string, {
    principalId: string;
    purpose: 'owner' | 'client';
    binding: {
      retryKey: string;
      credential: string;
      clientName?: string;
      response:
        | { purpose: 'client'; client_id: string; server_capabilities: [] }
        | { purpose: 'owner'; client_id: string; server_capabilities: ['create_cube'] };
    } | null;
  }>();
  private cubeCreateBindings = new Map<string, {
    name: string;
    template: 'default';
    response: {
      cube_id: string;
      human_seat_role_id: string;
      default_worker_role_id: string;
      access: 'manage';
    };
  }>();
  private streams = new Set<{ principalId: string; cubeId: string; queue: AsyncQueue }>();
  private replayBarrier: {
    reached: Promise<void>;
    markReached: () => void;
    released: Promise<void>;
    release: () => void;
  } | null = null;
  private sequence = 1;

  constructor(private readonly fault?: Fault) {}

  readonly admin = {
    reset: async (): Promise<void> => {
      for (const stream of this.streams) stream.queue.close();
      this.principals.clear();
      this.cubes.clear();
      this.invitations.clear();
      this.cubeCreateBindings.clear();
      this.streams.clear();
      this.replayBarrier?.release();
      this.replayBarrier = null;
      this.sequence = 1;
    },
    createPrincipal: async (name: string): Promise<ConformancePrincipal> => {
      const handle = { id: this.uuid() };
      this.principals.set(handle.id, {
        handle,
        grants: new Map(),
        credential: null,
        droneCredential: null,
        revoked: false,
        serverCapabilities: new Set(),
      });
      void name;
      return handle;
    },
    createCube: async (name: string): Promise<ConformanceCube> => {
      const handle = { id: this.uuid() };
      this.cubes.set(handle.id, {
        handle, directive: '', taxonomyMarker: null,
        entries: [], claims: [], decisions: [], expired: new Set(),
        roles: new Map(), drones: new Map(),
      });
      void name;
      return handle;
    },
    grantCube: async (
      principal: ConformancePrincipal,
      cube: ConformanceCube,
      access: ConformanceCubeAccess = 'manage',
    ): Promise<void> => {
      this.principal(principal.id).grants.set(cube.id, access);
    },
    createRole: async (
      cube: ConformanceCube,
      input: { readonly roleClass: 'queen' | 'worker'; readonly isHumanSeat: boolean },
    ): Promise<ConformanceRole> => {
      const handle = { id: this.uuid() };
      this.cube(cube.id).roles.set(handle.id, { handle, ...input });
      return handle;
    },
    createDrone: async (
      principal: ConformancePrincipal,
      cube: ConformanceCube,
      role: ConformanceRole,
    ): Promise<ConformanceDrone> => {
      const cubeState = this.cube(cube.id);
      if (!cubeState.roles.has(role.id)) throw new Error('Cannot create a drone in a foreign role.');
      const handle = { id: this.uuid() };
      cubeState.drones.set(handle.id, {
        handle,
        principalId: principal.id,
        cubeId: cube.id,
        roleId: role.id,
        label: `conformance-${handle.id.slice(-8)}`,
        credential: null,
        sessionState: 'active',
        evicted: false,
        metadata: this.emptyMetadata(),
        metadataReported: false,
        metadataRevision: 0,
        lastSeen: '2026-07-14T10:00:00.000Z',
        heartbeatCount: 0,
        wakeCount: 0,
        modelTurnCount: 0,
      });
      return handle;
    },
    issueManagedDroneSession: async (drone: ConformanceDrone): Promise<string> => {
      const state = this.drone(drone.id);
      const credential = this.token('seat', this.sequence++);
      state.credential = credential;
      state.sessionState = 'active';
      return credential;
    },
    revokeManagedDroneSession: async (drone: ConformanceDrone): Promise<void> => {
      this.drone(drone.id).sessionState = 'revoked';
    },
    expireManagedDroneSession: async (drone: ConformanceDrone): Promise<void> => {
      this.drone(drone.id).sessionState = 'expired';
    },
    inspectManagedDrone: async (drone: ConformanceDrone) => {
      const state = this.drone(drone.id);
      return {
        role_id: state.roleId,
        evicted: state.evicted,
        session_revoked: state.sessionState === 'revoked',
      };
    },
    inspectDroneRuntimeState: async (drone: ConformanceDrone) => {
      const state = this.drone(drone.id);
      const principal = this.principal(state.principalId);
      const cube = this.cube(state.cubeId);
      return {
        metadata: { ...state.metadata },
        metadata_reported: state.metadataReported,
        metadata_revision: state.metadataRevision,
        cube_id: state.cubeId,
        role_id: state.roleId,
        session_state: state.sessionState,
        evicted: state.evicted,
        last_seen: state.lastSeen,
        heartbeat_count: state.heartbeatCount,
        wake_count: state.wakeCount,
        log_count: this.cube(state.cubeId).entries.length,
        model_turn_count: state.modelTurnCount,
        grant_access: principal.grants.get(state.cubeId) ?? null,
        server_capabilities: [...principal.serverCapabilities].sort(),
        principal_revoked: principal.revoked,
        session_bound: state.credential !== null,
        last_log_post: cube.entries.at(-1)?.created_at ?? null,
        last_regen_at: null,
        last_read_log_at: null,
        last_event_received_at: null,
        wake_path: 'live' as const,
        wake_alert: null,
        monitor_armed: true,
        sse_connected: true,
        claim_count: cube.claims.length,
        decision_count: cube.decisions.length,
        routing_eligible: !state.evicted && state.sessionState === 'active',
      };
    },
    inspectCubeManagementState: async (cube: ConformanceCube) => {
      const state = this.cube(cube.id);
      return {
        directive: state.directive,
        taxonomy_marker: state.taxonomyMarker,
        role_ids: [...state.roles.keys()].sort(),
        active_decision_ids: state.decisions
          .filter((decision) => decision.status === 'active')
          .map((decision) => decision.id)
          .sort(),
        drones: [...state.drones.values()]
          .map((drone) => ({
            id: drone.handle.id,
            role_id: drone.roleId,
            evicted: drone.evicted,
            session_revoked: drone.sessionState === 'revoked',
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    },
    grantCreateCubeCapability: async (principal: ConformancePrincipal): Promise<void> => {
      this.principal(principal.id).serverCapabilities.add('create_cube');
    },
    issueDroneSession: async (principal: ConformancePrincipal): Promise<string> => {
      const credential = this.token('drone', this.sequence++);
      this.principal(principal.id).droneCredential = credential;
      return credential;
    },
    issueSingleUseInvitation: async (
      principal: ConformancePrincipal,
      purpose: 'owner' | 'client',
    ): Promise<string> => {
      const invitation = this.token('invitation', this.sequence++);
      this.invitations.set(invitation, { principalId: principal.id, purpose, binding: null });
      return invitation;
    },
    observeAuthorityState: async () => ({
      enrolled_clients: [...this.principals.values()].filter((principal) => principal.credential !== null).length,
      enrollment_claims: [...this.invitations.values()].filter((invitation) => invitation.binding !== null).length,
      cubes: this.cubes.size,
      roles: [...this.cubes.values()].reduce((count, cube) => count + cube.roles.size, 0),
      grants: [...this.principals.values()].reduce((count, principal) => count + principal.grants.size, 0),
      server_capabilities: [...this.principals.values()].reduce(
        (count, principal) => count + principal.serverCapabilities.size,
        0,
      ),
      cube_create_bindings: this.cubeCreateBindings.size,
    }),
    inspectCreatedCube: async (
      creator: ConformancePrincipal,
      response: {
        cube_id: string;
        human_seat_role_id: string;
        default_worker_role_id: string;
      },
    ) => {
      const cube = this.cubes.get(response.cube_id);
      return {
        cube_exists: cube !== undefined,
        creator_has_grant: this.principal(creator.id).grants.has(response.cube_id),
        grant_count: [...this.principals.values()].filter(
          (principal) => principal.grants.has(response.cube_id),
        ).length,
        role_count: cube?.roles.size ?? 0,
        human_seat_role_matches:
          cube?.roles.get(response.human_seat_role_id)?.templateKind === 'human_seat',
        default_worker_role_matches:
          cube?.roles.get(response.default_worker_role_id)?.templateKind === 'default_worker',
      };
    },
    inspectEnrollmentPrincipal: async (
      principal: ConformancePrincipal,
      responseClientId: string,
    ) => {
      const matchingClaims = [...this.invitations.values()].filter(
        (invitation) => invitation.principalId === principal.id &&
          invitation.binding?.response.client_id === responseClientId,
      );
      const enrolledCredential = matchingClaims[0]?.binding?.credential;
      return {
        response_client_matches: principal.id === responseClientId,
        active_credential_bindings: matchingClaims.length,
        bound_credential_matches_enrollment:
          enrolledCredential !== undefined &&
          this.principal(principal.id).credential === enrolledCredential,
      };
    },
    revokePrincipal: async (principal: ConformancePrincipal): Promise<void> => {
      this.principal(principal.id).revoked = true;
      if (this.fault !== 'keep-stream-after-revoke') {
        for (const stream of this.streams) {
          if (stream.principalId === principal.id) stream.queue.close();
        }
      }
    },
    expireCursor: async (cube: ConformanceCube, cursor: LogCursor): Promise<void> => {
      this.cube(cube.id).expired.add(this.cursorKey(cursor));
    },
    armReplayTransition: () => {
      if (this.replayBarrier) throw new Error('Replay transition already armed.');
      let markReached!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => { markReached = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      this.replayBarrier = { reached, markReached, released, release };
      return { reached, release };
    },
  };

  readonly operations = {
    health: async (): Promise<ConformanceHttpResponse> => ({ status: 204, body: '' }),
    protocol: async (_credential: string | null): Promise<ConformanceHttpResponse> => {
      // Credential-free + mutation-free: the tag preflight ignores any bearer and
      // returns ONLY the exact tag, so a client checks it before sending secrets.
      return { status: 200, body: createProtocolTagPreflight() };
    },
    enroll: async (request: unknown): Promise<ConformanceHttpResponse> => {
      const envelope = decodeEnrollmentExchangeRequestEnvelope(request);
      const invitation = this.invitations.get(envelope.payload.invitation);
      if (!invitation) return this.error(401, ErrorCode.AUTH_INVALID);
      const clientName = envelope.payload.client_name;
      if (invitation.binding) {
        const retryKeyMatches = invitation.binding.retryKey === envelope.payload.retry_key ||
          this.fault === 'accept-retry-key-mismatch' ||
          (this.fault === 'owner-only-accept-mismatch' && invitation.purpose === 'owner');
        const credentialMatches = invitation.binding.credential === envelope.payload.client_credential ||
          this.fault === 'accept-credential-mismatch' ||
          (this.fault === 'owner-only-accept-mismatch' && invitation.purpose === 'owner');
        const clientNameMatches = invitation.binding.clientName === clientName ||
          this.fault === 'accept-client-name-mismatch' ||
          (this.fault === 'owner-only-accept-mismatch' && invitation.purpose === 'owner');
        if (!retryKeyMatches || !credentialMatches || !clientNameMatches) {
          if (this.fault === 'overwrite-credential-on-reject' ||
              (this.fault === 'owner-only-overwrite-on-reject' && invitation.purpose === 'owner')) {
            this.principal(invitation.principalId).credential = envelope.payload.client_credential;
          }
          if (this.fault === 'leak-retry-diagnostic') {
            return {
              status: 401,
              body: {
                protocol_version: '3',
                error: {
                  code: ErrorCode.AUTH_INVALID,
                  message: `retry_key=${envelope.payload.retry_key}`,
                  details: `invitation=${envelope.payload.invitation} client_credential=${envelope.payload.client_credential}`,
                },
              },
            };
          }
          const leakedOriginal = this.fault === 'leak-original-invitation'
            ? envelope.payload.invitation
            : this.fault === 'leak-original-retry-key'
              ? invitation.binding.retryKey
              : this.fault === 'leak-original-credential'
                ? invitation.binding.credential
                : null;
          if (leakedOriginal !== null) {
            return {
              status: 401,
              body: {
                protocol_version: '3',
                error: { code: ErrorCode.AUTH_INVALID, message: `Bound value ${leakedOriginal}.` },
              },
            };
          }
          return this.error(401, ErrorCode.AUTH_INVALID);
        }
        if ((this.fault === 'mutate-exact-enrollment-retry' ||
             (this.fault === 'owner-only-retry-mutation' && invitation.purpose === 'owner')) &&
            invitation.binding.retryKey === envelope.payload.retry_key &&
            invitation.binding.credential === envelope.payload.client_credential &&
            invitation.binding.clientName === clientName) {
          const handle = { id: this.uuid() };
          this.cubes.set(handle.id, {
            handle, directive: '', taxonomyMarker: null,
            entries: [], claims: [], decisions: [], expired: new Set(),
            roles: new Map(), drones: new Map(),
          });
        }
        return {
          status: 201,
          body: createProtocolEnvelope(envelope.request_id, invitation.binding.response),
        };
      }
      const principal = this.principal(invitation.principalId);
      principal.credential = envelope.payload.client_credential;
      if (invitation.purpose === 'owner' && this.fault !== 'omit-owner-create-cube') {
        principal.serverCapabilities.add('create_cube');
      }
      if (invitation.purpose === 'client' && this.fault === 'grant-ordinary-create-cube') {
        principal.serverCapabilities.add('create_cube');
      }
      if (invitation.purpose === 'owner' && this.fault === 'create-state-during-owner-enrollment') {
        const handle = { id: this.uuid() };
        const humanSeatRoleId = this.uuid();
        const defaultWorkerRoleId = this.uuid();
        this.cubes.set(handle.id, {
          handle,
          directive: '',
          taxonomyMarker: null,
          entries: [],
          claims: [],
          decisions: [],
          expired: new Set(),
          roles: new Map([
            [humanSeatRoleId, {
              handle: { id: humanSeatRoleId }, roleClass: 'queen', isHumanSeat: true,
              templateKind: 'human_seat',
            }],
            [defaultWorkerRoleId, {
              handle: { id: defaultWorkerRoleId }, roleClass: 'worker', isHumanSeat: false,
              templateKind: 'default_worker',
            }],
          ]),
          drones: new Map(),
        });
        principal.grants.set(handle.id, 'manage');
      }
      const response = invitation.purpose === 'owner'
        ? {
            purpose: 'owner' as const,
            client_id: principal.handle.id,
            server_capabilities: (this.fault === 'omit-owner-create-cube' ? [] : ['create_cube']) as ['create_cube'],
          }
        : {
            purpose: 'client' as const,
            client_id: principal.handle.id,
            server_capabilities: [] as [],
          };
      invitation.binding = {
        retryKey: envelope.payload.retry_key,
        credential: envelope.payload.client_credential,
        clientName,
        response,
      };
      return {
        status: 201,
        body: createProtocolEnvelope(envelope.request_id, response),
      };
    },
    createCube: async (credential: string | null, request: unknown): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      const isDroneSession = auth.droneSession;
      if (isDroneSession && this.fault !== 'allow-drone-cube-create') {
        return this.error(403, ErrorCode.ACCESS_DENIED);
      }
      if (!isDroneSession && !auth.principal.serverCapabilities.has('create_cube') &&
          this.fault !== 'allow-ordinary-cube-create') {
        if (this.fault === 'leak-cube-retry-diagnostic') {
          const envelope = decodeCreateCubeRequestEnvelope(request);
          return {
            status: 403,
            body: {
              protocol_version: '3',
              error: {
                code: ErrorCode.ACCESS_DENIED,
                message: `retry_key=${envelope.payload.retry_key}`,
              },
            },
          };
        }
        return this.error(403, ErrorCode.ACCESS_DENIED);
      }
      const envelope = decodeCreateCubeRequestEnvelope(request);
      const bindingKey = this.fault === 'global-cube-retry-binding'
        ? envelope.payload.retry_key
        : `${auth.principal.handle.id}/${envelope.payload.retry_key}`;
      const binding = this.cubeCreateBindings.get(bindingKey);
      if (binding && this.fault !== 'duplicate-exact-cube-retry') {
        if (binding.name !== envelope.payload.name || binding.template !== envelope.payload.template) {
          return this.error(409, ErrorCode.INVALID_INPUT);
        }
        return { status: 201, body: createProtocolEnvelope(envelope.request_id, binding.response) };
      }
      const handle = { id: this.uuid() };
      const humanSeatRoleId = this.uuid();
      const defaultWorkerRoleId = this.uuid();
      this.cubes.set(handle.id, {
        handle,
        directive: '',
        taxonomyMarker: null,
        entries: [],
        claims: [],
        decisions: [],
        expired: new Set(),
        roles: new Map([
          [humanSeatRoleId, {
            handle: { id: humanSeatRoleId }, roleClass: 'queen', isHumanSeat: true,
            templateKind: 'human_seat',
          }],
          [defaultWorkerRoleId, {
            handle: { id: defaultWorkerRoleId }, roleClass: 'worker', isHumanSeat: false,
            templateKind: 'default_worker',
          }],
        ]),
        drones: new Map(),
      });
      if (this.fault === 'grant-created-cube-to-wrong-client') {
        const other = [...this.principals.values()].find((principal) => principal !== auth.principal);
        if (!other) throw new Error('Wrong-client grant fault requires another principal.');
        other.grants.set(handle.id, 'manage');
      } else {
        auth.principal.grants.set(handle.id, 'manage');
      }
      const response = {
        cube_id: handle.id,
        human_seat_role_id: this.fault === 'swap-created-role-identities' ? defaultWorkerRoleId : humanSeatRoleId,
        default_worker_role_id: this.fault === 'swap-created-role-identities' ? humanSeatRoleId : defaultWorkerRoleId,
        access: 'manage' as const,
      };
      this.cubeCreateBindings.set(bindingKey, {
        name: envelope.payload.name,
        template: envelope.payload.template,
        response,
      });
      return { status: 201, body: createProtocolEnvelope(envelope.request_id, response) };
    },
    attach: async (credential: string, request: unknown): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      if (auth.droneSession) return this.error(403, ErrorCode.ACCESS_DENIED);
      let envelope;
      try {
        envelope = decodeAttachRequestEnvelope(request);
      } catch (error) {
        if (error instanceof ProtocolContractError) return this.error(400, ErrorCode.INVALID_INPUT);
        throw error;
      }
      const cube = this.cubes.get(envelope.payload.cube_id);
      const role = cube?.roles.get(envelope.payload.role_id);
      if (!cube || !role || !auth.principal.grants.has(cube.handle.id)) {
        return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      }
      let drone = envelope.payload.prior_drone_id
        ? cube.drones.get(envelope.payload.prior_drone_id)
        : undefined;
      const reused = drone !== undefined && drone.principalId === auth.principal.handle.id && !drone.evicted;
      if (drone && !reused) return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      if (!drone) {
        const handle = { id: this.uuid() };
        drone = {
          handle,
          principalId: auth.principal.handle.id,
          cubeId: cube.handle.id,
          roleId: role.handle.id,
          label: `conformance-${handle.id.slice(-8)}`,
          credential: null,
          sessionState: 'active',
          evicted: false,
          metadata: this.emptyMetadata(),
          metadataReported: false,
          metadataRevision: 0,
          lastSeen: '2026-07-14T10:00:00.000Z',
          heartbeatCount: 0,
          wakeCount: 0,
          modelTurnCount: 0,
        };
        cube.drones.set(handle.id, drone);
      }
      if (envelope.payload.runtime_metadata !== undefined &&
          !same(drone.metadata, envelope.payload.runtime_metadata)) {
        drone.metadata = { ...envelope.payload.runtime_metadata };
        drone.metadataRevision++;
      }
      if (envelope.payload.runtime_metadata !== undefined) drone.metadataReported = true;
      drone.credential = envelope.payload.session_credential;
      drone.sessionState = 'active';
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          result: reused ? 'reused' : 'created',
          cube: { id: cube.handle.id, name: 'conformance-cube' },
          role: { id: role.handle.id, name: 'Builder', role_class: role.roleClass, is_human_seat: role.isHumanSeat },
          drone: {
            id: drone.handle.id,
            label: drone.label,
            runtime_metadata: drone.metadata,
            runtime_metadata_reported: drone.metadataReported,
          },
          session: { id: this.uuid() },
        }),
      };
    },
    selfMetadataUpdate: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      if (!auth.droneSession || !auth.drone) return this.error(403, ErrorCode.ACCESS_DENIED);
      if (auth.drone.cubeId !== cubeHandle.id) return this.error(404, ErrorCode.NOT_FOUND);
      let envelope;
      try {
        envelope = decodeProtocolEnvelope(request, decodeDroneRuntimeMetadataPatch);
      } catch (error) {
        if (this.fault === 'metadata-partial-invalid-write') {
          auth.drone.metadata.agent_kind = 'claude';
        }
        if (this.fault === 'metadata-raw-echo') {
          return {
            status: 400,
            body: { protocol_version: '3', error: { code: ErrorCode.INVALID_INPUT, message: JSON.stringify(request) } },
          };
        }
        if (error instanceof ProtocolContractError) return this.error(400, ErrorCode.INVALID_INPUT);
        throw error;
      }
      const target = this.fault === 'metadata-cross-seat-write'
        ? [...this.cube(cubeHandle.id).drones.values()].find((candidate) => candidate !== auth.drone) ?? auth.drone
        : auth.drone;
      const next = { ...target.metadata, ...envelope.payload };
      if (!same(target.metadata, next)) {
        target.metadata = next;
        target.metadataRevision++;
      }
      target.metadataReported = true;
      if (this.fault === 'metadata-derived-role-mutation' && envelope.payload.agent_kind !== undefined) {
        const foreignRole = [...this.cube(cubeHandle.id).roles.values()].find(
          (candidate) => candidate.handle.id !== target.roleId,
        );
        if (foreignRole) target.roleId = foreignRole.handle.id;
      }
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          runtime_metadata: target.metadata,
          runtime_metadata_reported: target.metadataReported,
        }),
      };
    },
    append: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, decodeAppendLogRequest);
      const cube = this.cube(cubeHandle.id);
      const recipients = envelope.payload.recipientDroneIds ?? [];
      if (recipients.some((id) => {
        const recipient = cube.drones.get(id);
        return recipient === undefined ||
          (recipient.evicted && this.fault !== 'keep-evicted-drone-routable');
      })) {
        return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      }
      const entry: EnrichedStreamEntry = {
        id: this.uuid(),
        cube_id: cubeHandle.id,
        drone_id: access.drone?.handle.id ?? access.principal.handle.id,
        message: envelope.payload.message,
        visibility: envelope.payload.visibility ?? 'broadcast',
        created_at: this.timestamp(),
        drone_label: 'one-of-one-builder',
        role_name: 'Builder',
        recipient_drone_ids: recipients,
      };
      cube.entries.push(entry);
      const frame = encodeSseEvent({ type: 'log', cursor: this.cursor(entry), entry });
      for (const stream of this.streams) {
        if (stream.cubeId === cubeHandle.id && !this.principal(stream.principalId).revoked) {
          stream.queue.push(frame);
        }
      }
      return { status: 201, body: createProtocolEnvelope(envelope.request_id, { entry }) };
    },
    appendRaw: async (
      credential: string,
      cubeHandle: ConformanceCube,
      body: string,
    ): Promise<ConformanceHttpResponse> => {
      if (this.fault !== 'accept-oversize-request' &&
          utf8ByteLength(body) > this.limits.max_request_bytes) {
        return this.error(413, ErrorCode.CONTENT_TOO_LARGE);
      }
      let request: unknown;
      try {
        request = JSON.parse(body);
      } catch {
        return this.error(400, ErrorCode.INVALID_INPUT);
      }
      if (this.fault === 'interpret-injection-input') {
        const envelope = decodeProtocolEnvelope(request, decodeAppendLogRequest);
        if (envelope.payload.message.includes('DROP TABLE')) {
          request = createProtocolEnvelope(envelope.request_id, { message: 'interpreted-input' });
        }
      }
      return this.operations.append(credential, cubeHandle, request);
    },
    read: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, decodeReadLogRequest);
      const cube = this.cube(cubeHandle.id);
      if (envelope.payload.cursor && cube.expired.has(this.cursorKey(envelope.payload.cursor))) {
        return this.error(410, ErrorCode.CURSOR_EXPIRED, envelope.request_id);
      }
      const after = this.afterCursor(cube.entries, envelope.payload.cursor);
      const limit = envelope.payload.limit ?? 500;
      const entries = after.slice(0, limit);
      const cursor = entries.length > 0 ? this.cursor(entries.at(-1)!) : envelope.payload.cursor;
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          entries,
          cursor,
          behind_by: after.length - entries.length,
          has_more: after.length > entries.length,
          claims: cube.claims,
        }),
      };
    },
    ack: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, decodeAckLogRequest);
      const cube = this.cube(cubeHandle.id);
      if (envelope.payload.kind === 'claim' &&
          !cube.claims.some((claim) => claim.log_entry_id === envelope.payload.entry_id && claim.claimant_drone_id === access.principal.handle.id)) {
        cube.claims.push({
          log_entry_id: envelope.payload.entry_id,
          claimant_drone_id: access.principal.handle.id,
          claimant_label: 'one-of-one-builder',
          claimant_role: 'Builder',
          claimed_at: this.timestamp(),
          stale: false,
        });
      }
      return { status: 204, body: '' };
    },
    updateCube: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, (payload) => payload as { cube_directive: string });
      const cube = this.cube(cubeHandle.id);
      cube.directive = envelope.payload.cube_directive;
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, { cube_directive: cube.directive }),
      };
    },
    createRole: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, (payload) => payload as { name: string });
      const handle = { id: this.uuid() };
      this.cube(cubeHandle.id).roles.set(handle.id, {
        handle,
        roleClass: 'worker',
        isHumanSeat: false,
      });
      return {
        status: 201,
        body: createProtocolEnvelope(envelope.request_id, { role: { id: handle.id, name: envelope.payload.name } }),
      };
    },
    patchTaxonomy: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, (payload) => payload as { marker: string });
      const cube = this.cube(cubeHandle.id);
      cube.taxonomyMarker = envelope.payload.marker;
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, { marker: cube.taxonomyMarker }),
      };
    },
    recordDecision: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, decodeRecordDecisionRequest);
      const cube = this.cube(cubeHandle.id);
      const prior = cube.decisions.find((decision) => decision.topic === envelope.payload.topic && decision.status === 'active');
      if (prior) prior.status = 'superseded';
      const decision: Decision = {
        id: this.uuid(),
        cube_id: cubeHandle.id,
        topic: envelope.payload.topic,
        decision: envelope.payload.decision,
        rationale: envelope.payload.rationale ?? null,
        ratified_by: access.principal.handle.id,
        status: 'active',
        supersedes: prior?.id ?? null,
        created_at: this.timestamp(),
      };
      cube.decisions.push(decision);
      return { status: 201, body: createProtocolEnvelope(envelope.request_id, { decision }) };
    },
    listDecisions: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, (payload) => payload);
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          decisions: this.cube(cubeHandle.id).decisions.filter((decision) => decision.status === 'active'),
        }),
      };
    },
    listDrones: async (
      credential: string,
      cubeHandle: ConformanceCube,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const drones = [...this.cube(cubeHandle.id).drones.values()]
        .filter((drone) => !drone.evicted || this.fault === 'keep-evicted-drone-visible')
        .map((drone) => ({
          ...this.managedDronePayload(drone),
          ...drone.metadata,
          runtime_metadata_reported: drone.metadataReported,
        }));
      return {
        status: 200,
        body: createProtocolEnvelope('drones-read', { drones }),
      };
    },
    reassignDrone: async (
      credential: string,
      cubeHandle: ConformanceCube,
      droneHandle: ConformanceDrone,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeReassignDroneRequestEnvelope(request);
      const cube = this.cube(cubeHandle.id);
      const drone = cube.drones.get(droneHandle.id) ??
        (this.fault === 'allow-cross-cube-drone-target' ? this.drone(droneHandle.id) : undefined);
      const targetRole = cube.roles.get(envelope.payload.role_id) ??
        (this.fault === 'allow-cross-cube-role-target'
          ? this.role(envelope.payload.role_id)
          : undefined);
      if (!drone || drone.evicted || !targetRole) {
        return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      }
      const sourceRole = cube.roles.get(drone.roleId) ??
        (this.fault === 'allow-cross-cube-drone-target' ? this.role(drone.roleId) : undefined);
      if (!sourceRole) throw new Error('Managed drone source role is unavailable.');
      if (targetRole.roleClass === 'queen' && !sourceRole.isHumanSeat &&
          this.fault !== 'allow-worker-queen-promotion') {
        return this.error(403, ErrorCode.ACCESS_DENIED, envelope.request_id);
      }
      if (targetRole.isHumanSeat && this.fault !== 'allow-occupied-human-seat' &&
          [...cube.drones.values()].some(
        (candidate) => candidate.handle.id !== drone.handle.id && !candidate.evicted &&
          candidate.roleId === targetRole.handle.id,
      )) {
        return this.error(409, ErrorCode.ROLE_IN_USE, envelope.request_id);
      }
      drone.roleId = targetRole.handle.id;
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          drone: this.managedDronePayload(drone),
        }),
      };
    },
    evictDrone: async (
      credential: string,
      cubeHandle: ConformanceCube,
      droneHandle: ConformanceDrone,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) {
        if (this.fault === 'revoke-session-on-eviction-denial') {
          this.drone(droneHandle.id).sessionState = 'revoked';
        }
        return access.error;
      }
      const envelope = decodeEvictDroneRequestEnvelope(request);
      const drone = this.cube(cubeHandle.id).drones.get(droneHandle.id) ??
        (this.fault === 'allow-cross-cube-drone-target' ? this.drone(droneHandle.id) : undefined);
      if (!drone || drone.evicted) return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      drone.evicted = true;
      if (this.fault !== 'skip-eviction-session-revocation') drone.sessionState = 'revoked';
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          drone_id: drone.handle.id,
          evicted: true,
        }),
      };
    },
    openStream: async (
      credential: string,
      cubeHandle: ConformanceCube,
      cursor: LogCursor | null,
    ): Promise<ConformanceStreamResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return { ...access.error, stream: null };
      const cube = this.cube(cubeHandle.id);
      if (cursor && cube.expired.has(this.cursorKey(cursor))) {
        return { ...this.error(410, ErrorCode.CURSOR_EXPIRED), stream: null };
      }
      const queue = new AsyncQueue();
      const replayCursor = this.fault === 'ignore-stream-cursor' ? null : cursor;
      const initialReplay = this.afterCursor(cube.entries, replayCursor);
      for (const entry of initialReplay) {
        queue.push(encodeSseEvent({ type: 'log', cursor: this.cursor(entry), entry }));
      }
      const replayHighWater = initialReplay.length > 0
        ? this.cursor(initialReplay.at(-1)!)
        : replayCursor;
      if (this.replayBarrier) {
        const barrier = this.replayBarrier;
        barrier.markReached();
        await barrier.released;
        this.replayBarrier = null;
        if (this.fault !== 'drop-transition-write') {
          for (const entry of this.afterCursor(cube.entries, replayHighWater)) {
            queue.push(encodeSseEvent({ type: 'log', cursor: this.cursor(entry), entry }));
          }
        }
      }
      queue.push(encodeSseEvent({
        type: 'bookmark',
        as_of: this.timestamp(),
        replay_complete: true,
        ...(cube.entries.length > 0 ? { next_cursor: this.cursor(cube.entries.at(-1)!) } : {}),
        cursor_status: 'valid',
      }));
      this.streams.add({ principalId: access.principal.handle.id, cubeId: cubeHandle.id, queue });
      return { status: 200, body: '', stream: queue };
    },
  };

  private authenticate(credential: string | null):
    | { principal: PrincipalState; drone?: DroneState; droneSession: boolean; error?: undefined }
    | { principal?: undefined; drone?: undefined; droneSession?: undefined; error: ConformanceHttpResponse } {
    if (credential === null) return { error: this.error(401, ErrorCode.AUTH_MISSING) };
    for (const cube of this.cubes.values()) {
      for (const drone of cube.drones.values()) {
        if (drone.credential !== credential) continue;
        if (drone.evicted) {
          return { error: this.fault === 'collapse-eviction-signal'
            ? this.error(401, ErrorCode.SESSION_REVOKED)
            : this.error(410, ErrorCode.DRONE_EVICTED) };
        }
        if (drone.sessionState === 'revoked') {
          return { error: this.error(401, ErrorCode.SESSION_REVOKED) };
        }
        if (drone.sessionState === 'expired') {
          return { error: this.error(
            401,
            this.fault === 'collapse-session-expiry'
              ? ErrorCode.SESSION_REVOKED
              : ErrorCode.AUTH_EXPIRED,
          ) };
        }
        const principal = this.principal(drone.principalId);
        if (principal.revoked) return { error: this.error(401, ErrorCode.SESSION_REVOKED) };
        return { principal, drone, droneSession: true };
      }
    }
    const principal = [...this.principals.values()].find(
      (item) => item.credential === credential || item.droneCredential === credential,
    );
    if (!principal) return { error: this.error(401, ErrorCode.AUTH_INVALID) };
    if (principal.revoked) return { error: this.error(401, ErrorCode.SESSION_REVOKED) };
    return { principal, droneSession: principal.droneCredential === credential };
  }

  private authorize(credential: string, cubeId: string):
    | { principal: PrincipalState; drone?: DroneState; droneSession: boolean; error?: undefined }
    | { principal?: undefined; drone?: undefined; droneSession?: undefined; error: ConformanceHttpResponse } {
    const auth = this.authenticate(credential);
    if (auth.error) return auth;
    if (this.fault !== 'cross-cube-leak' && !auth.principal.grants.has(cubeId)) {
      return { error: this.error(404, ErrorCode.NOT_FOUND) };
    }
    return auth;
  }

  private authorizeManager(credential: string, cubeId: string):
    | { principal: PrincipalState; droneSession: false; error?: undefined }
    | { principal?: undefined; droneSession?: undefined; error: ConformanceHttpResponse } {
    const auth = this.authenticate(credential);
    if (auth.error) return auth;
    if (auth.drone !== undefined && auth.drone.cubeId !== cubeId &&
        this.fault !== 'reveal-cross-cube-drone-session') {
      return { error: this.error(404, ErrorCode.NOT_FOUND) };
    }
    const access = auth.principal.grants.get(cubeId);
    if (access === undefined && this.fault !== 'allow-cross-cube-drone-management') {
      return { error: this.fault === 'reveal-unknown-manage-denial'
        ? this.error(403, ErrorCode.ACCESS_DENIED)
        : this.error(404, ErrorCode.NOT_FOUND) };
    }
    if (auth.droneSession) {
      return { error: this.fault === 'hide-known-manage-denial'
        ? this.error(404, ErrorCode.NOT_FOUND)
        : this.error(403, ErrorCode.ACCESS_DENIED) };
    }
    if (access !== 'manage' && this.fault !== 'allow-non-manage-drone-management') {
      return { error: this.fault === 'hide-known-manage-denial'
        ? this.error(404, ErrorCode.NOT_FOUND)
        : this.error(403, ErrorCode.ACCESS_DENIED) };
    }
    return { principal: auth.principal, droneSession: false };
  }

  private afterCursor(entries: EnrichedStreamEntry[], cursor: LogCursor | null): EnrichedStreamEntry[] {
    if (!cursor) return [...entries];
    return entries.filter((entry) => compareLogCursor(this.cursor(entry), cursor) > 0);
  }

  private cursor(entry: EnrichedStreamEntry): LogCursor {
    return { id: entry.id, created_at: entry.created_at };
  }

  private cursorKey(cursor: LogCursor): string {
    return `${cursor.created_at}/${cursor.id}`;
  }

  private principal(id: string): PrincipalState {
    const value = this.principals.get(id);
    if (!value) throw new Error(`Unknown principal ${id}.`);
    return value;
  }

  private cube(id: string): CubeState {
    const value = this.cubes.get(id);
    if (!value) throw new Error(`Unknown cube ${id}.`);
    return value;
  }

  private drone(id: string): DroneState {
    for (const cube of this.cubes.values()) {
      const drone = cube.drones.get(id);
      if (drone) return drone;
    }
    throw new Error(`Unknown drone ${id}.`);
  }

  private role(id: string): RoleState {
    for (const cube of this.cubes.values()) {
      const role = cube.roles.get(id);
      if (role) return role;
    }
    throw new Error(`Unknown role ${id}.`);
  }

  private managedDronePayload(drone: DroneState): {
    id: string;
    cube_id: string;
    role_id: string;
    label: string;
  } {
    return {
      id: drone.handle.id,
      cube_id: drone.cubeId,
      role_id: drone.roleId,
      label: drone.label,
    };
  }

  private emptyMetadata(): DroneRuntimeMetadata {
    return {
      agent_kind: null,
      reported_model: null,
      working_repo_name: null,
      working_repo_origin: null,
    };
  }

  private uuid(): string {
    return `00000000-0000-4000-8000-${String(this.sequence++).padStart(12, '0')}`;
  }

  private timestamp(): string {
    return new Date(Date.UTC(2026, 6, 14, 10, 0, 0, this.sequence++)).toISOString();
  }

  private token(prefix: string, sequence: number): string {
    return `${prefix}_${String(sequence).padStart(64 - prefix.length, '0')}`;
  }

  private error(status: number, code: ErrorCode, requestId?: string): ConformanceHttpResponse {
    return {
      status,
      body: {
        protocol_version: '3',
        ...(requestId ? { request_id: requestId } : {}),
        error: { code, message: 'Conformance request failed.' },
      },
    };
  }
}

describe('executable adapter conformance', () => {
  const fastTimeouts = { streamDeadlineMs: 100, pendingProbeMs: 10 };

  it('drives a stateful reference environment end to end', async () => {
    const report = await runAdapterConformance(new MemoryConformanceEnvironment(), fastTimeouts);
    expect(
      report.ok,
      JSON.stringify(report.results.filter((result) => !result.ok)),
    ).toBe(true);
    expect(report.results.map((result) => result.id)).toEqual(
      ADAPTER_CONFORMANCE_FIXTURES.map((fixture) => fixture.id),
    );
    expect(report.results.every((result) => result.ok)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('SECRET-METADATA-KEY-MARKER');
  });

  it.each([
    ['cross-cube leak', 'cross-cube-leak', 'security.cross-cube-isolation'],
    ['ignored replay cursor', 'ignore-stream-cursor', 'sse.replay-live-transition'],
    ['dropped replay-transition write', 'drop-transition-write', 'sse.replay-live-transition'],
    ['unterminated revoked stream', 'keep-stream-after-revoke', 'security.active-stream-revocation'],
    ['interpreted adapter-boundary injection', 'interpret-injection-input', 'security.adapter-boundary-injection'],
    ['accepted oversized request body', 'accept-oversize-request', 'security.oversize-request'],
    ['accepted enrollment retry-key mismatch', 'accept-retry-key-mismatch', 'enrollment.retry-authority'],
    ['accepted enrollment credential mismatch', 'accept-credential-mismatch', 'enrollment.retry-authority'],
    ['accepted enrollment client-name mismatch', 'accept-client-name-mismatch', 'enrollment.retry-authority'],
    ['leaked retry tuple in diagnostics', 'leak-retry-diagnostic', 'enrollment.retry-authority'],
    ['mutated exact enrollment retry', 'mutate-exact-enrollment-retry', 'enrollment.retry-authority'],
    ['granted create-cube to ordinary enrollment', 'grant-ordinary-create-cube', 'enrollment.retry-authority'],
    ['created cube state during owner enrollment', 'create-state-during-owner-enrollment', 'enrollment.retry-authority'],
    ['omitted owner create-cube authority', 'omit-owner-create-cube', 'enrollment.retry-authority'],
    ['allowed ordinary cube creation', 'allow-ordinary-cube-create', 'enrollment.retry-authority'],
    ['duplicated exact cube-create retry', 'duplicate-exact-cube-retry', 'enrollment.retry-authority'],
    ['granted created cube to wrong client', 'grant-created-cube-to-wrong-client', 'enrollment.retry-authority'],
    ['swapped created role identities', 'swap-created-role-identities', 'enrollment.retry-authority'],
    ['overwrote credential on rejected mismatch', 'overwrite-credential-on-reject', 'enrollment.retry-authority'],
    ['accepted owner-only enrollment mismatch', 'owner-only-accept-mismatch', 'enrollment.retry-authority'],
    ['overwrote owner credential on rejected mismatch', 'owner-only-overwrite-on-reject', 'enrollment.retry-authority'],
    ['mutated owner-only exact retry', 'owner-only-retry-mutation', 'enrollment.retry-authority'],
    ['used a global cube-create retry binding', 'global-cube-retry-binding', 'enrollment.retry-authority'],
    ['allowed drone-session cube creation', 'allow-drone-cube-create', 'enrollment.retry-authority'],
    ['leaked original invitation', 'leak-original-invitation', 'enrollment.retry-authority'],
    ['leaked original retry key', 'leak-original-retry-key', 'enrollment.retry-authority'],
    ['leaked original credential', 'leak-original-credential', 'enrollment.retry-authority'],
    ['leaked cube-create retry key', 'leak-cube-retry-diagnostic', 'enrollment.retry-authority'],
    ['allowed worker-to-queen promotion', 'allow-worker-queen-promotion', 'drones.reassign-invariants'],
    ['allowed occupied human-seat assignment', 'allow-occupied-human-seat', 'drones.reassign-invariants'],
    ['allowed cross-cube drone management', 'allow-cross-cube-drone-management', 'security.cross-cube-drone-management'],
    ['collapsed eviction into session revocation', 'collapse-eviction-signal', 'drones.evict-terminal-signal'],
    ['kept evicted drone in roster', 'keep-evicted-drone-visible', 'drones.evict-terminal-signal'],
    ['kept evicted drone routable', 'keep-evicted-drone-routable', 'drones.evict-terminal-signal'],
    ['allowed non-manage drone management', 'allow-non-manage-drone-management', 'security.drone-management-authorization'],
    ['allowed cross-cube drone target', 'allow-cross-cube-drone-target', 'security.cross-cube-drone-management'],
    ['allowed cross-cube role target', 'allow-cross-cube-role-target', 'security.cross-cube-drone-management'],
    ['skipped eviction credential revocation', 'skip-eviction-session-revocation', 'drones.evict-terminal-signal'],
    ['hid known non-manage denial as 404', 'hide-known-manage-denial', 'security.manage-access-matrix'],
    ['revealed unknown cube through 403', 'reveal-unknown-manage-denial', 'security.manage-access-matrix'],
    ['revoked target session on denied eviction', 'revoke-session-on-eviction-denial', 'security.manage-access-matrix'],
    ['revealed cross-cube target to bound drone session', 'reveal-cross-cube-drone-session', 'security.cross-cube-drone-management'],
    ['collapsed expired session into revocation', 'collapse-session-expiry', 'security.drone-session-rejection-causes'],
    ['wrote metadata to another seat', 'metadata-cross-seat-write', 'security.metadata-own-seat'],
    ['partially wrote an invalid metadata patch', 'metadata-partial-invalid-write', 'security.metadata-invalid-atomic'],
    ['derived a role mutation from metadata', 'metadata-derived-role-mutation', 'security.metadata-own-seat'],
    ['echoed raw hostile metadata', 'metadata-raw-echo', 'security.metadata-secret-non-echo'],
  ] as const)('rejects a hostile environment with %s', async (_name, fault, fixture) => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment(fault),
      fastTimeouts,
    );
    expect(report.ok).toBe(false);
    expect(report.results).toContainEqual(expect.objectContaining({ id: fixture, ok: false }));
  });
});
