import { describe, expect, it } from 'vitest';
import {
  ADAPTER_CONFORMANCE_FIXTURES,
  ErrorCode,
  ProtocolContractError,
  compareLogCursor,
  createProtocolEnvelope,
  createProtocolTagPreflight,
  decodeAckLogRequest,
  decodeAckStatusRequestEnvelope,
  decodeEntryQueryRequestEnvelope,
  decodeAppendLogRequest,
  decodeEnrollmentExchangeRequestEnvelope,
  encodeInvitationArtifact,
  decodeAttachRequestEnvelope,
  decodeAssociateRepositoryCubeRequestEnvelope,
  decodeCreateCubeRequestEnvelope,
  decodeDeleteCubeRequestEnvelope,
  decodeDroneRuntimeMetadataPatch,
  decodeEvictDroneRequestEnvelope,
  decodeDeleteRoleRequestEnvelope,
  decodeRoleRationaleRequestEnvelope,
  decodeProtocolEnvelope,
  decodeReadLogRequest,
  decodeResolveRepositoryCubeRequestEnvelope,
  decodeReassignDroneRequestEnvelope,
  decodeRecordDecisionRequest,
  decodeGetDocumentRequestEnvelope,
  decodeListDocumentsRequestEnvelope,
  decodePutDocumentRequestEnvelope,
  decodeRemoveDocumentRequestEnvelope,
  parseRoleSections,
  ROLE_RATIONALE_SECTION_BODY_MAX_BYTES,
  encodeSseEvent,
  PROTOCOL_VERSION,
  runAdapterConformance,
  utf8ByteLength,
  type ConformanceCube,
  type ConformanceCubeAccess,
  type ConformanceEnvironment,
  type ConformanceDrone,
  type ConformanceHttpResponse,
  type ConformancePrincipal,
  type ConformanceRepositoryCubeFixture,
  type ConformanceRole,
  type ConformanceStreamResponse,
  type CreateCubeRepository,
  type CreateCubeResponse,
  type CubeTemplate,
  type Decision,
  type EnrichedStreamEntry,
  type LogCursor,
  type ResolvedRepositoryCube,
  type ReadLogClaim,
  type DroneRuntimeMetadata,
  type CubeDocument,
} from '../src/index.js';

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type Fault =
  | 'allow-read-document-put'
  | 'allow-peer-document-remove'
  | 'skip-document-budget'
  | 'allow-document-branch'
  | 'allow-unknown-document-citation'
  | 'deny-author-document-remove'
  | 'deny-read-document-list'
  | 'allow-foreign-document-get'
  | 'leak-foreign-document-diagnostic'
  | 'allow-foreign-document-list'
  | 'leak-foreign-document-list'
  | 'allow-foreign-document-remove'
  | 'allow-foreign-document-citation'
  | 'allow-read-document-remove'
  | 'deny-read-removed-document-get'
  | 'mutate-over-budget-successor'
  | 'cross-cube-leak'
  | 'skip-message-class-configuration'
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
  | 'return-created-on-cross-client-retry'
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
  | 'metadata-cross-seat-write'
  | 'metadata-partial-invalid-write'
  | 'metadata-derived-role-mutation'
  | 'metadata-raw-echo'
  | 'allow-non-manage-cube-delete'
  | 'incomplete-cube-delete-cascade'
  | 'drop-cube-delete-terminal-event'
  | 'forget-cube-delete-after-restart'
  | 'forget-some-cube-delete-credentials-after-restart'
  | 'reveal-deleted-cube-on-delete'
  | 'allow-active-role-delete'
  | 'allow-default-role-delete'
  | 'allow-required-role-delete'
  | 'allow-referenced-role-delete'
  | 'reveal-unknown-role-delete'
  | 'wrong-role-in-use-message'
  | 'skip-evicted-role-retarget'
  | 'drop-role-log-attribution'
  | 'rationale-case-sensitive'
  | 'normalize-rationale-body'
  | 'wrong-rationale-role-code'
  | 'wrong-rationale-section-code'
  | 'accept-ambiguous-rationale-role'
  | 'append-rationale-section'
  | 'oversize-rationale-body'
  | 'ack-status-false-ack'
  | 'ack-status-collapse-claim'
  | 'ack-status-consume-unread'
  | 'ack-status-unknown-as-missing'
  | 'ack-status-writes-ack'
  | 'accept-prose-routing-annotation'
  | 'reject-prose-routing-escape'
  | 'entry-query-writes-ack'
  | 'entry-query-consumes-entry'
  | 'entry-query-returns-first-ambiguous'
  | 'entry-query-clears-acks'
  | 'entry-query-clears-claims';

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
  name: string | null;
  workingRepoName: string | null;
  repository: CreateCubeRepository | null;
  template: CubeTemplate | null;
  directive: string;
  taxonomyMarker: string | null;
  messageClassRouting: Map<string, string[]>;
  entries: EnrichedStreamEntry[];
  posts: Map<string, {
    entry: EnrichedStreamEntry;
    message: string;
    visibility: 'broadcast' | 'direct';
    recipientDroneIds: string[];
    class: string | null;
    documents: string[];
  }>;
  claims: ReadLogClaim[];
  acknowledgements: Array<{
    logEntryId: string;
    droneId: string;
    acknowledgedAt: string;
  }>;
  decisions: Decision[];
  expired: Set<string>;
  roles: Map<string, RoleState>;
  drones: Map<string, DroneState>;
  documents: Map<string, { document: CubeDocument; authorPrincipalId: string }>;
}

interface RoleState {
  handle: ConformanceRole;
  roleClass: 'queen' | 'worker';
  isHumanSeat: boolean;
  name?: string;
  detailedDescription?: string;
  isDefault?: boolean;
  isMandatory?: boolean;
  taxonomyReferenced?: boolean;
  templateKind?: 'human_seat' | 'default_worker';
}

interface DroneState {
  handle: ConformanceDrone;
  principalId: string;
  cubeId: string;
  roleId: string;
  label: string;
  credential: string | null;
  sessionState: 'active' | 'revoked';
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
    max_log_message_bytes: 4096,
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
    repository: CreateCubeRepository;
    template: CubeTemplate;
    response: CreateCubeResponse;
  }>();
  private repositoryAssociations = new Map<string, CreateCubeResponse | ResolvedRepositoryCube>();
  private streams = new Set<{ principalId: string; cubeId: string; queue: AsyncQueue }>();
  private deletedCubes = new Map<string, {
    principalIds: Set<string>;
    credentials: Set<string>;
  }>();
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
      this.repositoryAssociations.clear();
      this.deletedCubes.clear();
      this.streams.clear();
      this.replayBarrier?.release();
      this.replayBarrier = null;
      this.sequence = 1;
    },
    restartAuthority: async (): Promise<void> => {
      for (const stream of this.streams) stream.queue.close();
      this.streams.clear();
      if (this.fault === 'forget-cube-delete-after-restart') this.deletedCubes.clear();
      if (this.fault === 'forget-some-cube-delete-credentials-after-restart') {
        for (const tombstone of this.deletedCubes.values()) {
          for (const credential of tombstone.credentials) {
            // Preserve the manager and drone entries covered by the old gate while
            // selectively losing creator/read/write terminal state.
            if (!credential.startsWith('M') && !credential.startsWith('seat_')) {
              tombstone.credentials.delete(credential);
            }
          }
        }
      }
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
        handle, name: null, workingRepoName: null, repository: null, template: null,
        directive: '', taxonomyMarker: null,
        messageClassRouting: new Map(),
        entries: [], posts: new Map(), claims: [], acknowledgements: [], decisions: [], expired: new Set(),
        roles: new Map(), drones: new Map(), documents: new Map(),
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
    revokeCubeGrant: async (
      principal: ConformancePrincipal,
      cube: ConformanceCube,
    ): Promise<void> => {
      this.principal(principal.id).grants.delete(cube.id);
    },
    createRole: async (
      cube: ConformanceCube,
      input: {
        readonly roleClass: 'queen' | 'worker';
        readonly isHumanSeat: boolean;
        readonly name?: string;
        readonly detailedDescription?: string;
        readonly isDefault?: boolean;
        readonly isMandatory?: boolean;
      },
    ): Promise<ConformanceRole> => {
      const handle = { id: this.uuid() };
      this.cube(cube.id).roles.set(handle.id, { handle, ...input });
      return handle;
    },
    referenceRoleFromTaxonomy: async (
      cube: ConformanceCube,
      role: ConformanceRole,
    ): Promise<void> => {
      const state = this.cube(cube.id).roles.get(role.id);
      if (!state) throw new Error('Cannot reference a foreign role from taxonomy.');
      state.taxonomyReferenced = true;
    },
    configureMessageClassRouting: async (
      cube: ConformanceCube,
      className: string,
      recipientDroneIds: readonly string[],
    ): Promise<void> => {
      if (this.fault === 'skip-message-class-configuration') return;
      const state = this.cube(cube.id);
      if (recipientDroneIds.some((id) => !state.drones.has(id))) {
        throw new Error('Cannot route a message class to an unknown drone.');
      }
      state.messageClassRouting.set(className, [...recipientDroneIds].sort());
    },
    replaceLogEntryId: async (
      cube: ConformanceCube,
      currentId: string,
      replacementId: string,
    ): Promise<void> => {
      const state = this.cube(cube.id);
      const entry = state.entries.find((candidate) => candidate.id === currentId);
      if (!entry || state.entries.some((candidate) => candidate.id === replacementId)) {
        throw new Error('Cannot replace an unknown log entry id or create a duplicate.');
      }
      entry.id = replacementId;
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
      const secret = this.token('invitation', this.sequence++);
      const invitation = encodeInvitationArtifact({
        version: 2,
        endpoint: 'https://127.0.0.1:7091',
        ca_spki_sha256: 'a'.repeat(64),
        authority: purpose,
        secret,
        integrity: this.token('integrity', this.sequence++),
      });
      this.invitations.set(invitation, { principalId: principal.id, purpose, binding: null });
      return invitation;
    },
    observeAuthorityState: async () => ({
      enrolled_clients: [...this.principals.values()].filter((principal) => principal.credential !== null).length,
      enrollment_claims: [...this.invitations.values()].filter((invitation) => invitation.binding !== null).length,
      activity_acknowledgements: [...this.cubes.values()].reduce(
        (count, cube) => count + cube.acknowledgements.length,
        0,
      ),
      activity_claims: [...this.cubes.values()].reduce((count, cube) => count + cube.claims.length, 0),
      activity_log_entries: [...this.cubes.values()].reduce((count, cube) => count + cube.entries.length, 0),
      cubes: this.cubes.size,
      roles: [...this.cubes.values()].reduce((count, cube) => count + cube.roles.size, 0),
      grants: [...this.principals.values()].reduce((count, principal) => count + principal.grants.size, 0),
      server_capabilities: [...this.principals.values()].reduce(
        (count, principal) => count + principal.serverCapabilities.size,
        0,
      ),
      cube_create_bindings: this.cubeCreateBindings.size,
      repository_associations: this.repositoryAssociations.size,
    }),
    inspectCreatedCube: async (
      creator: ConformancePrincipal,
      response: CreateCubeResponse,
    ) => {
      const cube = this.cubes.get(response.cube_id);
      if (!cube?.name || !cube.workingRepoName || !cube.repository || !cube.template) {
        throw new Error('Created cube has no authoritative creation readback.');
      }
      return {
        cube_exists: cube !== undefined,
        creator_has_grant: this.principal(creator.id).grants.has(response.cube_id),
        creator_access: this.principal(creator.id).grants.get(response.cube_id) === 'manage'
          ? 'manage' as const
          : null,
        grant_count: [...this.principals.values()].filter(
          (principal) => principal.grants.has(response.cube_id),
        ).length,
        role_count: cube?.roles.size ?? 0,
        name: cube.name,
        working_repo_name: cube.workingRepoName,
        repository: cube.repository,
        template: cube.template,
        human_seat_role_id: [...cube.roles.values()].find(
          (role) => role.templateKind === 'human_seat',
        )?.handle.id ?? '',
        default_worker_role_id: [...cube.roles.values()].find(
          (role) => role.templateKind === 'default_worker',
        )?.handle.id ?? '',
        human_seat_role_matches:
          cube?.roles.get(response.human_seat_role_id)?.templateKind === 'human_seat',
        default_worker_role_matches:
          cube?.roles.get(response.default_worker_role_id)?.templateKind === 'default_worker',
      };
    },
    inspectDeletedCube: async (cubeHandle: ConformanceCube) => {
      const cube = this.cubes.get(cubeHandle.id);
      return {
        cube_exists: cube !== undefined,
        role_count: cube?.roles.size ?? 0,
        drone_count: cube?.drones.size ?? 0,
        log_count: cube?.entries.length ?? 0,
        claim_count: cube?.claims.length ?? 0,
        decision_count: cube?.decisions.length ?? 0,
        grant_count: [...this.principals.values()].filter(
          (principal) => principal.grants.has(cubeHandle.id),
        ).length,
        cube_create_binding_count: [...this.cubeCreateBindings.values()].filter(
          (binding) => binding.response.cube_id === cubeHandle.id,
        ).length,
        repository_association_count: [...this.repositoryAssociations.values()].filter(
          (association) => association.cube_id === cubeHandle.id,
        ).length,
        active_stream_count: [...this.streams].filter(
          (stream) => stream.cubeId === cubeHandle.id,
        ).length,
        terminal_credential_count: this.deletedCubes.get(cubeHandle.id)?.credentials.size ?? 0,
      };
    },
    prepareRepositoryCube: async (
      cubeHandle: ConformanceCube,
      input: {
        name: string;
        template: CubeTemplate;
      },
    ): Promise<ConformanceRepositoryCubeFixture> => {
      const cube = this.cube(cubeHandle.id);
      cube.name = input.name;
      cube.template = input.template;
      const humanSeatRoleId = this.uuid();
      const defaultWorkerRoleId = this.uuid();
      cube.roles.set(humanSeatRoleId, {
        handle: { id: humanSeatRoleId },
        roleClass: 'queen',
        isHumanSeat: true,
        templateKind: 'human_seat',
      });
      cube.roles.set(defaultWorkerRoleId, {
        handle: { id: defaultWorkerRoleId },
        roleClass: 'worker',
        isHumanSeat: false,
        templateKind: 'default_worker',
      });
      return {
        cube_id: cubeHandle.id,
        name: input.name,
        template: input.template,
        human_seat_role_id: humanSeatRoleId,
        default_worker_role_id: defaultWorkerRoleId,
        access: 'manage',
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
                protocol_version: '12',
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
                protocol_version: '12',
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
            handle, name: null, workingRepoName: null, repository: null, template: null,
            directive: '', taxonomyMarker: null,
            messageClassRouting: new Map(),
            entries: [], posts: new Map(), claims: [], acknowledgements: [], decisions: [], expired: new Set(),
            roles: new Map(), drones: new Map(), documents: new Map(),
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
          name: null,
          workingRepoName: null,
          repository: null,
          template: null,
          directive: '',
          taxonomyMarker: null,
          messageClassRouting: new Map(),
          entries: [],
          posts: new Map(),
          claims: [],
          acknowledgements: [],
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
          documents: new Map(),
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
              protocol_version: '12',
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
        if (
          binding.name !== envelope.payload.name ||
          !same(binding.repository, envelope.payload.repository) ||
          binding.template !== envelope.payload.template
        ) {
          return this.error(409, ErrorCode.INVALID_INPUT);
        }
        return {
          status: 201,
          body: createProtocolEnvelope(envelope.request_id, {
            ...binding.response,
            result: this.fault === 'return-created-on-cross-client-retry' &&
              envelope.payload.repository.kind === 'local'
              ? 'created'
              : 'resolved',
          }),
        };
      }
      const associationKey = `${auth.principal.handle.id}/${envelope.payload.repository.kind}/${envelope.payload.repository.value}`;
      const associated = this.repositoryAssociations.get(associationKey);
      if (associated && this.fault !== 'duplicate-exact-cube-retry') {
        return {
          status: 201,
          body: createProtocolEnvelope(envelope.request_id, { ...associated, result: 'resolved' }),
        };
      }
      const handle = { id: this.uuid() };
      const humanSeatRoleId = this.uuid();
      const defaultWorkerRoleId = this.uuid();
      this.cubes.set(handle.id, {
        handle,
        name: envelope.payload.name,
        workingRepoName: envelope.payload.working_repo_name,
        repository: envelope.payload.repository,
        template: envelope.payload.template,
        directive: '',
        taxonomyMarker: null,
        messageClassRouting: new Map(),
        entries: [],
        posts: new Map(),
        claims: [],
        acknowledgements: [],
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
        documents: new Map(),
      });
      if (this.fault === 'grant-created-cube-to-wrong-client') {
        const other = [...this.principals.values()].find((principal) => principal !== auth.principal);
        if (!other) throw new Error('Wrong-client grant fault requires another principal.');
        other.grants.set(handle.id, 'manage');
      } else {
        auth.principal.grants.set(handle.id, 'manage');
      }
      const response = {
        result: 'created' as const,
        cube_id: handle.id,
        name: envelope.payload.name,
        working_repo_name: envelope.payload.working_repo_name,
        repository: envelope.payload.repository,
        template: envelope.payload.template,
        human_seat_role_id: this.fault === 'swap-created-role-identities' ? defaultWorkerRoleId : humanSeatRoleId,
        default_worker_role_id: this.fault === 'swap-created-role-identities' ? humanSeatRoleId : defaultWorkerRoleId,
        access: 'manage' as const,
      };
      this.cubeCreateBindings.set(bindingKey, {
        name: envelope.payload.name,
        repository: envelope.payload.repository,
        template: envelope.payload.template,
        response,
      });
      this.repositoryAssociations.set(associationKey, response);
      return { status: 201, body: createProtocolEnvelope(envelope.request_id, response) };
    },
    deleteCube: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      if (this.fault === 'reveal-deleted-cube-on-delete' && this.deletedCubes.has(cubeHandle.id)) {
        return this.error(410, ErrorCode.CUBE_DELETED);
      }
      const terminal = this.deletedCubeResponse(credential, cubeHandle.id);
      if (terminal) return terminal;
      const access = this.fault === 'allow-non-manage-cube-delete'
        ? this.authorize(credential, cubeHandle.id)
        : this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeDeleteCubeRequestEnvelope(request);
      const cube = this.cube(cubeHandle.id);
      const principalIds = new Set(
        [...this.principals.values()]
          .filter((principal) => principal.grants.has(cubeHandle.id))
          .map((principal) => principal.handle.id),
      );
      const credentials = new Set<string>();
      for (const principalId of principalIds) {
        const principal = this.principal(principalId);
        if (principal.credential) credentials.add(principal.credential);
        if (principal.droneCredential) credentials.add(principal.droneCredential);
      }
      for (const drone of cube.drones.values()) {
        if (drone.credential) credentials.add(drone.credential);
      }
      this.deletedCubes.set(cubeHandle.id, { principalIds, credentials });

      const terminalFrame = encodeSseEvent({
        type: 'error',
        error: {
          protocol_version: PROTOCOL_VERSION,
          error: { code: ErrorCode.CUBE_DELETED, message: 'This cube was deleted.' },
        },
      });
      for (const stream of [...this.streams]) {
        if (stream.cubeId !== cubeHandle.id) continue;
        if (this.fault !== 'drop-cube-delete-terminal-event') stream.queue.push(terminalFrame);
        stream.queue.close();
        this.streams.delete(stream);
      }
      for (const principal of this.principals.values()) principal.grants.delete(cubeHandle.id);
      if (this.fault !== 'incomplete-cube-delete-cascade') {
        for (const [key, binding] of this.cubeCreateBindings) {
          if (binding.response.cube_id === cubeHandle.id) this.cubeCreateBindings.delete(key);
        }
        for (const [key, association] of this.repositoryAssociations) {
          if (association.cube_id === cubeHandle.id) this.repositoryAssociations.delete(key);
        }
      }
      this.cubes.delete(cubeHandle.id);
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          cube_id: cubeHandle.id,
          deleted: true,
        }),
      };
    },
    putDocument: async (credential: string, cubeHandle: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const cubeAccess = access.principal.grants.get(cubeHandle.id);
      if (cubeAccess !== 'write' && cubeAccess !== 'manage' && this.fault !== 'allow-read-document-put') {
        return this.error(403, ErrorCode.ACCESS_DENIED);
      }
      let envelope;
      try {
        envelope = decodePutDocumentRequestEnvelope(request);
      } catch (error) {
        if (error instanceof ProtocolContractError) return this.error(400, error.code);
        throw error;
      }
      const cube = this.cube(cubeHandle.id);
      const contentBytes = utf8ByteLength(envelope.payload.content);
      const activeBytes = [...cube.documents.values()]
        .filter(({ document }) => document.state !== 'removed')
        .reduce((total, { document }) => total + document.size_bytes, 0);
      if ((contentBytes > 65_536 || activeBytes + contentBytes > 524_288) && this.fault !== 'skip-document-budget') {
        if (this.fault === 'mutate-over-budget-successor' && envelope.payload.supersedes) {
          const previous = cube.documents.get(envelope.payload.supersedes);
          if (previous) previous.document = {
            ...previous.document,
            state: 'superseded',
            superseded_by: this.uuid(),
          };
        }
        return this.error(413, ErrorCode.DOCUMENT_BUDGET_EXCEEDED, envelope.request_id);
      }
      const id = this.uuid();
      const now = '2026-01-01T00:00:00.000Z';
      const actor = { drone_id: null, label: null, role: null };
      const document: CubeDocument = {
        id,
        title: envelope.payload.title,
        content_type: envelope.payload.content_type,
        content: envelope.payload.content,
        size_bytes: contentBytes,
        state: 'active',
        supersedes: envelope.payload.supersedes ?? null,
        superseded_by: null,
        author: actor,
        created_at: now,
        removed_by: null,
        removed_at: null,
      };
      if (document.supersedes !== null) {
        const previous = cube.documents.get(document.supersedes);
        if ((!previous || previous.document.state !== 'active' || previous.document.superseded_by !== null) &&
            this.fault !== 'allow-document-branch') {
          return this.error(409, ErrorCode.DOCUMENT_SUPERSESSION_INVALID, envelope.request_id);
        }
        if (!previous) return this.error(409, ErrorCode.DOCUMENT_SUPERSESSION_INVALID, envelope.request_id);
        previous.document = { ...previous.document, state: 'superseded', superseded_by: id };
        for (const entry of cube.entries) {
          entry.documents = entry.documents?.map((citation) => citation.id === previous.document.id
            ? { ...citation, state: 'superseded' }
            : citation);
        }
      }
      cube.documents.set(id, { document, authorPrincipalId: access.principal.handle.id });
      return { status: 201, body: createProtocolEnvelope(envelope.request_id, { document }) };
    },
    getDocument: async (credential: string, cubeHandle: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeGetDocumentRequestEnvelope(request);
      const localStored = this.cube(cubeHandle.id).documents.get(envelope.payload.id);
      if (!localStored && this.fault === 'leak-foreign-document-diagnostic') {
        const foreign = this.globalDocument(envelope.payload.id)?.stored.document;
        if (foreign) return this.error(
          404,
          ErrorCode.DOCUMENT_NOT_FOUND,
          envelope.request_id,
          `Hidden document: ${foreign.title}; ${foreign.content}`,
        );
      }
      const stored = localStored ??
        (this.fault === 'allow-foreign-document-get'
          ? this.globalDocument(envelope.payload.id)?.stored
          : undefined);
      if (!stored) return this.error(404, ErrorCode.DOCUMENT_NOT_FOUND, envelope.request_id);
      if (this.fault === 'deny-read-removed-document-get' && stored.document.state === 'removed' &&
          access.principal.grants.get(cubeHandle.id) === 'read') {
        return this.error(403, ErrorCode.ACCESS_DENIED, envelope.request_id);
      }
      return { status: 200, body: createProtocolEnvelope(envelope.request_id, { document: stored.document }) };
    },
    listDocuments: async (credential: string, cubeHandle: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse> => {
      const access = this.fault === 'allow-foreign-document-list'
        ? this.authenticate(credential)
        : this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      if (this.fault === 'deny-read-document-list' &&
          access.principal.grants.get(cubeHandle.id) === 'read') {
        return this.error(403, ErrorCode.ACCESS_DENIED);
      }
      const envelope = decodeListDocumentsRequestEnvelope(request);
      const storedDocuments = this.fault === 'leak-foreign-document-list'
        ? [...this.cubes.values()].flatMap((cube) => [...cube.documents.values()])
        : [...this.cube(cubeHandle.id).documents.values()];
      const documents = storedDocuments
        .map(({ document }) => document)
        .filter(({ state }) => state !== 'removed')
        .map(({ content: _content, ...metadata }) => metadata);
      return { status: 200, body: createProtocolEnvelope(envelope.request_id, { documents }) };
    },
    removeDocument: async (credential: string, cubeHandle: ConformanceCube, request: unknown): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeRemoveDocumentRequestEnvelope(request);
      const localStored = this.cube(cubeHandle.id).documents.get(envelope.payload.id);
      const foreign = this.fault === 'allow-foreign-document-remove'
        ? this.globalDocument(envelope.payload.id)
        : undefined;
      const stored = localStored ?? foreign?.stored;
      if (!stored) return this.error(404, ErrorCode.DOCUMENT_NOT_FOUND, envelope.request_id);
      const cubeAccess = access.principal.grants.get(cubeHandle.id);
      if (this.fault === 'deny-author-document-remove' &&
          stored.authorPrincipalId === access.principal.handle.id) {
        return this.error(403, ErrorCode.DOCUMENT_REMOVE_DENIED, envelope.request_id);
      }
      if (stored.authorPrincipalId !== access.principal.handle.id && cubeAccess !== 'manage' &&
          this.fault !== 'allow-read-document-remove' &&
          this.fault !== 'allow-foreign-document-remove' &&
          this.fault !== 'allow-peer-document-remove') {
        return this.error(403, ErrorCode.DOCUMENT_REMOVE_DENIED, envelope.request_id);
      }
      const { content: _content, ...metadata } = stored.document;
      const document = {
        ...metadata,
        state: 'removed' as const,
        removed_by: { drone_id: null, label: null, role: null },
        removed_at: '2026-01-01T00:01:00.000Z',
      };
      stored.document = { ...document, content: stored.document.content };
      for (const entry of this.cube(cubeHandle.id).entries) {
        entry.documents = entry.documents?.map((citation) => citation.id === document.id
          ? { ...citation, state: 'removed' }
          : citation);
      }
      return { status: 200, body: createProtocolEnvelope(envelope.request_id, { document }) };
    },
    resolveRepositoryCube: async (
      credential: string | null,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      if (auth.droneSession) return this.error(403, ErrorCode.ACCESS_DENIED);
      const envelope = decodeResolveRepositoryCubeRequestEnvelope(request);
      const key = `${auth.principal.handle.id}/${envelope.payload.repository.kind}/${envelope.payload.repository.value}`;
      const associated = this.repositoryAssociations.get(key);
      const visible = associated && auth.principal.grants.get(associated.cube_id) === 'manage';
      return {
        status: 200,
        body: createProtocolEnvelope(
          envelope.request_id,
          visible ? { ...associated, result: 'resolved' as const } : { result: 'none' as const },
        ),
      };
    },
    associateRepositoryCube: async (
      credential: string | null,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      if (auth.droneSession) return this.error(403, ErrorCode.ACCESS_DENIED);
      const envelope = decodeAssociateRepositoryCubeRequestEnvelope(request);
      const cube = this.cubes.get(envelope.payload.cube_id);
      if (!cube || auth.principal.grants.get(cube.handle.id) !== 'manage') {
        return this.error(403, ErrorCode.ACCESS_DENIED, envelope.request_id);
      }
      const key = `${auth.principal.handle.id}/${envelope.payload.repository.kind}/${envelope.payload.repository.value}`;
      const repositoryBinding = this.repositoryAssociations.get(key);
      if (repositoryBinding && repositoryBinding.cube_id !== cube.handle.id) {
        if (auth.principal.grants.get(repositoryBinding.cube_id) !== 'manage') {
          return this.error(403, ErrorCode.ACCESS_DENIED, envelope.request_id);
        }
        return this.error(409, ErrorCode.REPOSITORY_ALREADY_ASSOCIATED, envelope.request_id);
      }
      const cubeBinding = [...this.repositoryAssociations.entries()].find(
        ([associationKey, association]) =>
          associationKey.startsWith(`${auth.principal.handle.id}/`) && association.cube_id === cube.handle.id,
      );
      if (cubeBinding && cubeBinding[0] !== key) {
        return this.error(409, ErrorCode.CUBE_ALREADY_ASSOCIATED, envelope.request_id);
      }
      if (repositoryBinding) {
        return {
          status: 200,
          body: createProtocolEnvelope(envelope.request_id, { ...repositoryBinding, result: 'resolved' }),
        };
      }
      if (!cube.name || !cube.template) {
        return this.error(409, ErrorCode.INVALID_INPUT, envelope.request_id);
      }
      const humanSeatRoleId = [...cube.roles.values()].find(
        (role) => role.templateKind === 'human_seat',
      )?.handle.id;
      const defaultWorkerRoleId = [...cube.roles.values()].find(
        (role) => role.templateKind === 'default_worker',
      )?.handle.id;
      if (!humanSeatRoleId || !defaultWorkerRoleId) {
        return this.error(409, ErrorCode.INVALID_INPUT, envelope.request_id);
      }
      const response: ResolvedRepositoryCube = {
        result: 'resolved',
        cube_id: cube.handle.id,
        name: cube.name,
        working_repo_name: envelope.payload.working_repo_name,
        repository: envelope.payload.repository,
        template: cube.template,
        human_seat_role_id: humanSeatRoleId,
        default_worker_role_id: defaultWorkerRoleId,
        access: 'manage',
      };
      this.repositoryAssociations.set(key, response);
      return { status: 200, body: createProtocolEnvelope(envelope.request_id, response) };
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
          initial_log_cursor: cube.entries.length === 0
            ? null
            : this.cursor(cube.entries[cube.entries.length - 1]),
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
            body: { protocol_version: '12', error: { code: ErrorCode.INVALID_INPUT, message: JSON.stringify(request) } },
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
      let envelope;
      try {
        envelope = decodeProtocolEnvelope(request, decodeAppendLogRequest);
      } catch (error) {
        if (this.fault !== 'accept-prose-routing-annotation') {
          if (error instanceof ProtocolContractError) return this.error(400, ErrorCode.INVALID_INPUT);
          throw error;
        }
        envelope = decodeProtocolEnvelope(request, (payload) => payload as {
          post_id: string;
          message: string;
          visibility?: 'broadcast' | 'direct';
          recipientDroneIds?: string[];
          class?: string;
          to?: string[];
          documents?: string[];
        });
      }
      const cube = this.cube(cubeHandle.id);
      if (
        this.fault === 'reject-prose-routing-escape' &&
        /\bto\s*:\s*\[[^\]\r\n]*\]\s*$/iu.test(envelope.payload.message)
      ) {
        return this.error(400, ErrorCode.INVALID_INPUT, envelope.request_id);
      }
      const messageBytes = utf8ByteLength(envelope.payload.message);
      if (messageBytes > 4096) return this.error(413, ErrorCode.CONTENT_TOO_LARGE, envelope.request_id);
      const authorId = access.drone?.handle.id ?? access.principal.handle.id;
      const recipients = [...(envelope.payload.recipientDroneIds ?? [])].sort();
      const usesExplicitDelivery = envelope.payload.visibility !== undefined ||
        envelope.payload.recipientDroneIds !== undefined;
      const resolvedClass = usesExplicitDelivery ? null : envelope.payload.class ?? null;
      if (!usesExplicitDelivery && resolvedClass !== null && !cube.messageClassRouting.has(resolvedClass)) {
        return this.error(400, ErrorCode.INVALID_INPUT, envelope.request_id);
      }
      const resolvedRecipients = usesExplicitDelivery
        ? recipients
        : resolvedClass === null ? [] : cube.messageClassRouting.get(resolvedClass) ?? [];
      const resolvedRouting = {
        message: envelope.payload.message,
        visibility: envelope.payload.visibility ?? 'broadcast',
        recipientDroneIds: resolvedRecipients,
        class: resolvedClass,
        documents: [...(envelope.payload.documents ?? [])].sort(),
      };
      const postKey = `${authorId}/${envelope.payload.post_id}`;
      const existing = cube.posts.get(postKey);
      if (existing) {
        if (!same(resolvedRouting, {
          message: existing.message,
          visibility: existing.visibility,
          recipientDroneIds: existing.recipientDroneIds,
          class: existing.class,
          documents: existing.documents,
        })) {
          return this.error(409, ErrorCode.POST_ID_CONFLICT, envelope.request_id);
        }
        return {
          status: 201,
          body: createProtocolEnvelope(envelope.request_id, {
            entry: existing.entry,
            deduplicated: true,
            ...(messageBytes > 1024 ? { advisory: { code: 'STORE_AS_DOCUMENT', threshold_bytes: 1024 } } : {}),
          }),
        };
      }
      if (recipients.some((id) => {
        const recipient = cube.drones.get(id);
        return recipient === undefined ||
          (recipient.evicted && this.fault !== 'keep-evicted-drone-routable');
      })) {
        return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      }
      const cited = resolvedRouting.documents.map((id) => cube.documents.get(id)?.document ??
        (this.fault === 'allow-foreign-document-citation' ? this.globalDocument(id)?.stored.document : undefined) ??
        (this.fault === 'allow-unknown-document-citation' ? {
          id, title: 'Unknown', size_bytes: 0, state: 'active' as const,
        } : undefined));
      if (cited.some((document) => document === undefined)) {
        return this.error(404, ErrorCode.DOCUMENT_NOT_FOUND, envelope.request_id);
      }
      const entry: EnrichedStreamEntry = {
        id: this.uuid(),
        cube_id: cubeHandle.id,
        drone_id: authorId,
        message: envelope.payload.message,
        visibility: envelope.payload.visibility ?? 'broadcast',
        created_at: this.timestamp(),
        drone_label: 'one-of-one-builder',
        role_name: 'Builder',
        recipient_drone_ids: resolvedRecipients,
        ...(cited.length === 0 ? {} : {
          documents: cited.map((document) => ({
            id: document!.id,
            title: document!.title,
            size_bytes: document!.size_bytes,
            state: document!.state,
          })),
        }),
      };
      cube.entries.push(entry);
      cube.posts.set(postKey, { entry, ...resolvedRouting });
      const frame = encodeSseEvent({ type: 'log', cursor: this.cursor(entry), entry });
      for (const stream of this.streams) {
        if (stream.cubeId === cubeHandle.id && !this.principal(stream.principalId).revoked) {
          stream.queue.push(frame);
        }
      }
      return {
        status: 201,
        body: createProtocolEnvelope(envelope.request_id, {
          entry,
          deduplicated: false,
          ...(messageBytes > 1024 ? { advisory: { code: 'STORE_AS_DOCUMENT', threshold_bytes: 1024 } } : {}),
        }),
      };
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
          request = createProtocolEnvelope(envelope.request_id, {
            post_id: envelope.payload.post_id,
            message: 'interpreted-input',
          });
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
    entryQuery: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeEntryQueryRequestEnvelope(request);
      const cube = this.cube(cubeHandle.id);
      const matches = envelope.payload.entry_id.length === 36
        ? cube.entries.filter((entry) => entry.id === envelope.payload.entry_id)
        : cube.entries.filter((entry) => entry.id.startsWith(envelope.payload.entry_id));
      if (matches.length === 0) return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      if (matches.length > 1 && this.fault !== 'entry-query-returns-first-ambiguous') {
        return this.error(409, ErrorCode.LOG_ENTRY_PREFIX_AMBIGUOUS, envelope.request_id);
      }
      const entry = matches[0];
      if (this.fault === 'entry-query-clears-acks') cube.acknowledgements = [];
      if (this.fault === 'entry-query-clears-claims') cube.claims = [];
      if (this.fault === 'entry-query-writes-ack') {
        cube.acknowledgements.push({
          logEntryId: entry.id,
          droneId: access.principal.handle.id,
          acknowledgedAt: this.timestamp(),
        });
      }
      if (this.fault === 'entry-query-consumes-entry') {
        cube.entries = cube.entries.filter((candidate) => candidate.id !== entry.id);
      }
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, { entry }),
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
      const actorId = access.drone?.handle.id ?? access.principal.handle.id;
      if (envelope.payload.kind === 'ack' &&
          !cube.acknowledgements.some((acknowledgement) =>
            acknowledgement.logEntryId === envelope.payload.entry_id &&
            acknowledgement.droneId === actorId
          )) {
        cube.acknowledgements.push({
          logEntryId: envelope.payload.entry_id,
          droneId: actorId,
          acknowledgedAt: this.timestamp(),
        });
      }
      if (envelope.payload.kind === 'claim' &&
          !cube.claims.some((claim) => claim.log_entry_id === envelope.payload.entry_id && claim.claimant_drone_id === actorId)) {
        const role = access.drone === undefined ? undefined : cube.roles.get(access.drone.roleId);
        cube.claims.push({
          log_entry_id: envelope.payload.entry_id,
          claimant_drone_id: actorId,
          claimant_label: access.drone?.label ?? null,
          claimant_role: role?.name ?? null,
          claimed_at: this.timestamp(),
          stale: false,
        });
      }
      return { status: 204, body: '' };
    },
    ackStatus: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeAckStatusRequestEnvelope(request);
      const cube = this.cube(cubeHandle.id);
      const entry = cube.entries.find((candidate) => candidate.id === envelope.payload.entry_id);
      if (!entry) {
        if (this.fault === 'ack-status-unknown-as-missing') {
          return {
            status: 200,
            body: createProtocolEnvelope(envelope.request_id, {
              entry_id: envelope.payload.entry_id,
              visibility: 'broadcast',
              recipients: [],
              claims: [],
            }),
          };
        }
        return this.error(404, ErrorCode.NOT_FOUND, envelope.request_id);
      }
      if (this.fault === 'ack-status-writes-ack' &&
          !cube.acknowledgements.some((acknowledgement) =>
            acknowledgement.logEntryId === entry.id &&
            acknowledgement.droneId === access.principal.handle.id
          )) {
        cube.acknowledgements.push({
          logEntryId: entry.id,
          droneId: access.principal.handle.id,
          acknowledgedAt: this.timestamp(),
        });
      }
      const recipients = entry.recipient_drone_ids.map((droneId) => {
        const drone = cube.drones.get(droneId);
        const role = drone === undefined ? undefined : cube.roles.get(drone.roleId);
        const acknowledgement = cube.acknowledgements.find((candidate) =>
          candidate.logEntryId === entry.id && candidate.droneId === droneId
        );
        const collapsedClaim = cube.claims.find((claim) =>
          claim.log_entry_id === entry.id && claim.claimant_drone_id === droneId
        );
        return {
          drone_id: droneId,
          drone_label: drone?.label ?? null,
          drone_role: role?.name ?? null,
          acknowledged_at: acknowledgement?.acknowledgedAt ??
            (this.fault === 'ack-status-false-ack'
              ? this.timestamp()
              : this.fault === 'ack-status-collapse-claim' && collapsedClaim
                ? collapsedClaim.claimed_at
                : null),
        };
      });
      const claims = cube.claims
        .filter((claim) => claim.log_entry_id === entry.id)
        .map((claim) => ({
          drone_id: claim.claimant_drone_id,
          drone_label: claim.claimant_label,
          drone_role: claim.claimant_role,
          claimed_at: claim.claimed_at,
        }));
      if (this.fault === 'ack-status-consume-unread' && envelope.request_id === 'ack-status-distinct') {
        cube.entries = cube.entries.filter((candidate) => candidate.id !== entry.id);
      }
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          entry_id: entry.id,
          visibility: entry.visibility,
          recipients,
          claims,
        }),
      };
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
        name: envelope.payload.name,
        detailedDescription: '',
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
    deleteRole: async (
      credential: string,
      cubeHandle: ConformanceCube,
      roleHandle: ConformanceRole,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorizeManager(credential, cubeHandle.id);
      if (access.error) return access.error;
      let envelope;
      try {
        envelope = decodeDeleteRoleRequestEnvelope(request);
      } catch (error) {
        if (error instanceof ProtocolContractError) return this.error(400, ErrorCode.INVALID_INPUT);
        throw error;
      }
      const cube = this.cube(cubeHandle.id);
      const role = cube.roles.get(roleHandle.id);
      if (!role) {
        return this.error(
          this.fault === 'reveal-unknown-role-delete' ? 409 : 404,
          this.fault === 'reveal-unknown-role-delete' ? ErrorCode.ROLE_REQUIRED : ErrorCode.NOT_FOUND,
          envelope.request_id,
        );
      }
      if (role.isDefault && this.fault !== 'allow-default-role-delete') {
        return this.error(409, ErrorCode.DEFAULT_ROLE_REQUIRED, envelope.request_id);
      }
      if ((role.isMandatory || role.isHumanSeat) && this.fault !== 'allow-required-role-delete') {
        return this.error(409, ErrorCode.ROLE_REQUIRED, envelope.request_id);
      }
      if (role.taxonomyReferenced && this.fault !== 'allow-referenced-role-delete') {
        return this.error(409, ErrorCode.ROLE_REFERENCED, envelope.request_id);
      }
      if ([...cube.drones.values()].some(
        (drone) => !drone.evicted && drone.roleId === roleHandle.id,
      ) && this.fault !== 'allow-active-role-delete') {
        return this.error(
          409,
          ErrorCode.ROLE_IN_USE,
          envelope.request_id,
          this.fault === 'wrong-role-in-use-message'
            ? 'Role is in use.'
            : 'Reassign or evict every drone assigned to this role before deleting it.',
        );
      }
      const defaultRole = [...cube.roles.values()].find((candidate) => candidate.isDefault);
      if (!defaultRole) throw new Error('Role deletion fixture requires a surviving default role.');
      const affectedDroneIds = new Set(
        [...cube.drones.values()]
          .filter((drone) => drone.evicted && drone.roleId === roleHandle.id)
          .map((drone) => drone.handle.id),
      );
      if (this.fault !== 'skip-evicted-role-retarget') {
        for (const drone of cube.drones.values()) {
          if (affectedDroneIds.has(drone.handle.id)) drone.roleId = defaultRole.handle.id;
        }
      }
      if (this.fault === 'drop-role-log-attribution') {
        cube.entries = cube.entries.filter(
          (entry) => entry.drone_id === null || !affectedDroneIds.has(entry.drone_id),
        );
      }
      cube.roles.delete(roleHandle.id);
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          role_id: roleHandle.id,
          deleted: true,
        }),
      };
    },
    roleRationale: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      let envelope;
      try {
        envelope = decodeRoleRationaleRequestEnvelope(request);
      } catch (error) {
        if (error instanceof ProtocolContractError) return this.error(400, ErrorCode.INVALID_INPUT);
        throw error;
      }
      const cube = this.cube(cubeHandle.id);
      const selector = envelope.payload.role;
      const matchingNames = [...cube.roles.values()].filter((candidate) =>
        this.fault === 'rationale-case-sensitive'
          ? candidate.name === selector
          : candidate.name?.toLowerCase() === selector.toLowerCase()
      );
      if (
        !cube.roles.has(selector) &&
        matchingNames.length > 1 &&
        this.fault !== 'accept-ambiguous-rationale-role'
      ) {
        return this.error(400, ErrorCode.INVALID_INPUT, envelope.request_id);
      }
      const role = cube.roles.get(selector) ?? matchingNames[0];
      if (!role) {
        return this.error(
          404,
          this.fault === 'wrong-rationale-role-code'
            ? ErrorCode.NOT_FOUND
            : ErrorCode.ROLE_NOT_FOUND,
          envelope.request_id,
        );
      }
      const section = parseRoleSections(role.detailedDescription ?? '').find(
        (candidate) => candidate.kind === 'label' &&
          candidate.heading?.toLowerCase() === envelope.payload.section.toLowerCase(),
      );
      if (!section?.heading) {
        return this.error(
          404,
          this.fault === 'wrong-rationale-section-code'
            ? ErrorCode.NOT_FOUND
            : ErrorCode.ROLE_SECTION_NOT_FOUND,
          envelope.request_id,
        );
      }
      return {
        status: 200,
        body: createProtocolEnvelope(envelope.request_id, {
          role_id: role.handle.id,
          role_name: role.name ?? 'Unnamed Role',
          section: {
            heading: section.heading,
            body: this.fault === 'normalize-rationale-body'
              ? section.body.trim()
              : this.fault === 'append-rationale-section'
                ? `${section.body}Boundaries:\nLeaked neighboring section.\n`
                : this.fault === 'oversize-rationale-body'
                  ? `${section.heading}:\n${'a'.repeat(ROLE_RATIONALE_SECTION_BODY_MAX_BYTES)}`
                  : section.body,
          },
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
    const terminal = this.deletedCubeResponse(credential, cubeId);
    if (terminal) return { error: terminal };
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
    const terminal = this.deletedCubeResponse(credential, cubeId);
    if (terminal) return { error: terminal };
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

  private deletedCubeResponse(credential: string, cubeId: string): ConformanceHttpResponse | null {
    const tombstone = this.deletedCubes.get(cubeId);
    if (!tombstone) return null;
    return tombstone.credentials.has(credential)
      ? this.error(410, ErrorCode.CUBE_DELETED)
      : null;
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

  private globalDocument(id: string): {
    cube: CubeState;
    stored: { document: CubeDocument; authorPrincipalId: string };
  } | undefined {
    for (const cube of this.cubes.values()) {
      const stored = cube.documents.get(id);
      if (stored) return { cube, stored };
    }
    return undefined;
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

  private error(
    status: number,
    code: ErrorCode,
    requestId?: string,
    message = 'Conformance request failed.',
  ): ConformanceHttpResponse {
    return {
      status,
      body: {
        protocol_version: '12',
        ...(requestId ? { request_id: requestId } : {}),
        error: { code, message },
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

  it('rejects selective creator/read/write tombstone loss after restart', async () => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment('forget-some-cube-delete-credentials-after-restart'),
      fastTimeouts,
    );
    const deletion = report.results.find((result) => result.id === 'cubes.delete-terminal-cascade');
    expect(deletion).toMatchObject({ ok: false });
    expect(deletion?.error).toContain(
      'creator post-restart deleted-cube request returned HTTP 404; expected 410',
    );
  });

  it('rejects DELETE-only tombstone disclosure to a never-authorized caller', async () => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment('reveal-deleted-cube-on-delete'),
      fastTimeouts,
    );
    const deletion = report.results.find((result) => result.id === 'cubes.delete-terminal-cascade');
    expect(deletion).toMatchObject({ ok: false });
    expect(deletion?.error).toContain(
      'Never-authorized post-delete DELETE returned HTTP 410; expected 404',
    );
  });

  it('rejects a reference adapter without configured message classes', async () => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment('skip-message-class-configuration'),
      fastTimeouts,
    );
    expect(report.results).toContainEqual(expect.objectContaining({
      id: 'log.append-idempotency',
      ok: false,
    }));
  });

  it.each([
    ['allowed read-only document put', 'allow-read-document-put', 'documents.lifecycle'],
    ['allowed peer document removal', 'allow-peer-document-remove', 'documents.lifecycle'],
    ['skipped document budgets', 'skip-document-budget', 'documents.lifecycle'],
    ['allowed branching document supersession', 'allow-document-branch', 'documents.lifecycle'],
    ['allowed an unknown document citation', 'allow-unknown-document-citation', 'documents.lifecycle'],
    ['denied author document removal', 'deny-author-document-remove', 'documents.lifecycle'],
    ['denied read-only document listing', 'deny-read-document-list', 'documents.lifecycle'],
    ['allowed foreign document get', 'allow-foreign-document-get', 'documents.lifecycle'],
    ['leaked foreign document diagnostic', 'leak-foreign-document-diagnostic', 'documents.lifecycle'],
    ['allowed foreign document list', 'allow-foreign-document-list', 'documents.lifecycle'],
    ['leaked foreign document in list', 'leak-foreign-document-list', 'documents.lifecycle'],
    ['allowed foreign document removal', 'allow-foreign-document-remove', 'documents.lifecycle'],
    ['allowed foreign document citation', 'allow-foreign-document-citation', 'documents.lifecycle'],
    ['allowed read-only document removal', 'allow-read-document-remove', 'documents.lifecycle'],
    ['denied read-only removed document get', 'deny-read-removed-document-get', 'documents.lifecycle'],
    ['mutated predecessor before budget refusal', 'mutate-over-budget-successor', 'documents.lifecycle'],
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
    ['returned created on an exact cross-client retry', 'return-created-on-cross-client-retry', 'enrollment.retry-authority'],
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
    ['wrote metadata to another seat', 'metadata-cross-seat-write', 'security.metadata-own-seat'],
    ['partially wrote an invalid metadata patch', 'metadata-partial-invalid-write', 'security.metadata-invalid-atomic'],
    ['derived a role mutation from metadata', 'metadata-derived-role-mutation', 'security.metadata-own-seat'],
    ['echoed raw hostile metadata', 'metadata-raw-echo', 'security.metadata-secret-non-echo'],
    ['allowed non-manage cube deletion', 'allow-non-manage-cube-delete', 'cubes.delete-terminal-cascade'],
    ['left cube-owned state after deletion', 'incomplete-cube-delete-cascade', 'cubes.delete-terminal-cascade'],
    ['closed deleted-cube streams without a terminal error', 'drop-cube-delete-terminal-event', 'cubes.delete-terminal-cascade'],
    ['forgot deleted-cube terminal state after restart', 'forget-cube-delete-after-restart', 'cubes.delete-terminal-cascade'],
    ['allowed deletion of an actively assigned role', 'allow-active-role-delete', 'roles.delete-contract'],
    ['allowed deletion of the default role', 'allow-default-role-delete', 'roles.delete-contract'],
    ['allowed deletion of a required role', 'allow-required-role-delete', 'roles.delete-contract'],
    ['allowed deletion of a taxonomy-referenced role', 'allow-referenced-role-delete', 'roles.delete-contract'],
    ['revealed an unknown role through a typed integrity refusal', 'reveal-unknown-role-delete', 'roles.delete-contract'],
    ['returned an unactionable role-in-use message', 'wrong-role-in-use-message', 'roles.delete-contract'],
    ['left an evicted drone on its deleted role', 'skip-evicted-role-retarget', 'roles.delete-contract'],
    ['lost activity-log attribution during role deletion', 'drop-role-log-attribution', 'roles.delete-contract'],
    ['matched rationale role names case-sensitively', 'rationale-case-sensitive', 'roles.rationale-contract'],
    ['normalized the exact rationale section body', 'normalize-rationale-body', 'roles.rationale-contract'],
    ['collapsed the unknown-role rationale code', 'wrong-rationale-role-code', 'roles.rationale-contract'],
    ['collapsed the unknown-section rationale code', 'wrong-rationale-section-code', 'roles.rationale-contract'],
    ['accepted an ambiguous case-insensitive rationale role name', 'accept-ambiguous-rationale-role', 'roles.rationale-contract'],
    ['returned a neighboring rationale section', 'append-rationale-section', 'roles.rationale-contract'],
    ['returned an oversized rationale section', 'oversize-rationale-body', 'roles.rationale-contract'],
    ['reported a false acknowledgement', 'ack-status-false-ack', 'acks.status-query'],
    ['collapsed a claim into acknowledgement state', 'ack-status-collapse-claim', 'acks.status-query'],
    ['consumed unread state during status lookup', 'ack-status-consume-unread', 'acks.status-query'],
    ['returned missing acknowledgement state for an unknown entry', 'ack-status-unknown-as-missing', 'acks.status-query'],
    ['wrote an acknowledgement during status lookup', 'ack-status-writes-ack', 'acks.status-query'],
    ['accepted a prose-only routing annotation', 'accept-prose-routing-annotation', 'log.prose-routing-refusal'],
    ['rejected an explicit routing escape', 'reject-prose-routing-escape', 'log.prose-routing-refusal'],
    ['wrote an acknowledgement during entry lookup', 'entry-query-writes-ack', 'log.entry-query'],
    ['consumed an entry during lookup', 'entry-query-consumes-entry', 'log.entry-query'],
    ['returned the first ambiguous prefix match', 'entry-query-returns-first-ambiguous', 'log.entry-query'],
    ['cleared acknowledgements during entry lookup', 'entry-query-clears-acks', 'log.entry-query'],
    ['cleared claims during entry lookup', 'entry-query-clears-claims', 'log.entry-query'],
  ] as const)('rejects a hostile environment with %s', async (_name, fault, fixture) => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment(fault),
      fastTimeouts,
    );
    expect(report.ok).toBe(false);
    expect(report.results).toContainEqual(expect.objectContaining({ id: fixture, ok: false }));
  });
});
