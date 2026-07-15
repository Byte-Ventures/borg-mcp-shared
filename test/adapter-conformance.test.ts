import { describe, expect, it } from 'vitest';
import {
  ADAPTER_CONFORMANCE_FIXTURES,
  ErrorCode,
  REQUIRED_SECURITY_CAPABILITIES,
  SHARED_PACKAGE_NAME,
  SHARED_PACKAGE_VERSION,
  compareLogCursor,
  createProtocolEnvelope,
  decodeAckLogRequest,
  decodeAppendLogRequest,
  decodeEnrollmentExchangeRequestEnvelope,
  decodeProtocolEnvelope,
  decodeReadLogRequest,
  decodeRecordDecisionRequest,
  encodeSseEvent,
  runAdapterConformance,
  runEquivalentAdapterConformance,
  utf8ByteLength,
  type ConformanceCube,
  type ConformanceEnvironment,
  type ConformanceHttpResponse,
  type ConformancePrincipal,
  type ConformanceStreamResponse,
  type Decision,
  type EnrichedStreamEntry,
  type LogCursor,
  type ReadLogClaim,
} from '../src/index.js';

type Fault =
  | 'cross-cube-leak'
  | 'ignore-stream-cursor'
  | 'drop-transition-write'
  | 'keep-stream-after-revoke'
  | 'interpret-injection-input'
  | 'accept-oversize-request';

interface PrincipalState {
  handle: ConformancePrincipal;
  grants: Set<string>;
  credential: string | null;
  revoked: boolean;
}

interface CubeState {
  handle: ConformanceCube;
  entries: EnrichedStreamEntry[];
  claims: ReadLogClaim[];
  decisions: Decision[];
  expired: Set<string>;
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
    binding: {
      retryKey: string;
      credential: string;
      clientName?: string;
      response: { purpose: 'client'; client_id: string };
    } | null;
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
      this.streams.clear();
      this.replayBarrier?.release();
      this.replayBarrier = null;
      this.sequence = 1;
    },
    createPrincipal: async (name: string): Promise<ConformancePrincipal> => {
      const handle = { id: this.uuid() };
      this.principals.set(handle.id, { handle, grants: new Set(), credential: null, revoked: false });
      void name;
      return handle;
    },
    createCube: async (name: string): Promise<ConformanceCube> => {
      const handle = { id: this.uuid() };
      this.cubes.set(handle.id, { handle, entries: [], claims: [], decisions: [], expired: new Set() });
      void name;
      return handle;
    },
    grantCube: async (principal: ConformancePrincipal, cube: ConformanceCube): Promise<void> => {
      this.principal(principal.id).grants.add(cube.id);
    },
    issueSingleUseInvitation: async (principal: ConformancePrincipal): Promise<string> => {
      const invitation = this.token('invitation', this.sequence++);
      this.invitations.set(invitation, { principalId: principal.id, binding: null });
      return invitation;
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
    protocol: async (credential: string | null): Promise<ConformanceHttpResponse> => {
      const auth = this.authenticate(credential);
      if (auth.error) return auth.error;
      const supported = new Set([
        'coordination.core',
        ...REQUIRED_SECURITY_CAPABILITIES,
        'log.cursor',
        'stream.sse',
        'stream.replay',
        'acks',
        'claims',
        'decisions',
      ]);
      return {
        status: 200,
        body: createProtocolEnvelope('protocol', {
          protocol_version: '1',
          package: { name: SHARED_PACKAGE_NAME, version: SHARED_PACKAGE_VERSION },
          capabilities: [
            ...supported,
          ],
          limits: this.limits,
        }),
      };
    },
    enroll: async (request: unknown): Promise<ConformanceHttpResponse> => {
      const envelope = decodeEnrollmentExchangeRequestEnvelope(request);
      const invitation = this.invitations.get(envelope.payload.invitation);
      if (!invitation) return this.error(401, ErrorCode.AUTH_INVALID);
      const clientName = envelope.payload.client_name;
      if (invitation.binding) {
        if (invitation.binding.retryKey !== envelope.payload.retry_key ||
            invitation.binding.credential !== envelope.payload.client_credential ||
            invitation.binding.clientName !== clientName) {
          return this.error(401, ErrorCode.AUTH_INVALID);
        }
        return {
          status: 201,
          body: createProtocolEnvelope(envelope.request_id, invitation.binding.response),
        };
      }
      const principal = this.principal(invitation.principalId);
      principal.credential = envelope.payload.client_credential;
      const response = {
        purpose: 'client' as const,
        client_id: principal.handle.id,
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
    append: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
      if (access.error) return access.error;
      const envelope = decodeProtocolEnvelope(request, decodeAppendLogRequest);
      const cube = this.cube(cubeHandle.id);
      const entry: EnrichedStreamEntry = {
        id: this.uuid(),
        cube_id: cubeHandle.id,
        drone_id: access.principal.handle.id,
        message: envelope.payload.message,
        visibility: envelope.payload.visibility ?? 'broadcast',
        created_at: this.timestamp(),
        drone_label: 'one-of-one-builder',
        role_name: 'Builder',
        recipient_drone_ids: [],
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
    recordDecision: async (
      credential: string,
      cubeHandle: ConformanceCube,
      request: unknown,
    ): Promise<ConformanceHttpResponse> => {
      const access = this.authorize(credential, cubeHandle.id);
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
    { principal: PrincipalState; error?: undefined } | { principal?: undefined; error: ConformanceHttpResponse } {
    if (credential === null) return { error: this.error(401, ErrorCode.AUTH_MISSING) };
    const principal = [...this.principals.values()].find((item) => item.credential === credential);
    if (!principal) return { error: this.error(401, ErrorCode.AUTH_INVALID) };
    if (principal.revoked) return { error: this.error(401, ErrorCode.SESSION_REVOKED) };
    return { principal };
  }

  private authorize(credential: string, cubeId: string):
    { principal: PrincipalState; error?: undefined } | { principal?: undefined; error: ConformanceHttpResponse } {
    const auth = this.authenticate(credential);
    if (auth.error) return auth;
    if (this.fault !== 'cross-cube-leak' && !auth.principal.grants.has(cubeId)) {
      return { error: this.error(404, ErrorCode.NOT_FOUND) };
    }
    return auth;
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
        protocol_version: '1',
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
  });

  it('compares normalized cloud and local transcripts', async () => {
    const report = await runEquivalentAdapterConformance(
      new MemoryConformanceEnvironment(),
      new MemoryConformanceEnvironment(),
      fastTimeouts,
    );
    expect(report.ok).toBe(true);
    expect(report.equivalent).toBe(true);
    expect(report.cloud.normalizedTranscript).toEqual(report.local.normalizedTranscript);
  });

  it.each([
    ['cross-cube leak', 'cross-cube-leak', 'security.cross-cube-isolation'],
    ['ignored replay cursor', 'ignore-stream-cursor', 'sse.replay-live-transition'],
    ['dropped replay-transition write', 'drop-transition-write', 'sse.replay-live-transition'],
    ['unterminated revoked stream', 'keep-stream-after-revoke', 'security.active-stream-revocation'],
    ['interpreted adapter-boundary injection', 'interpret-injection-input', 'security.adapter-boundary-injection'],
    ['accepted oversized request body', 'accept-oversize-request', 'security.oversize-request'],
  ] as const)('rejects a hostile environment with %s', async (_name, fault, fixture) => {
    const report = await runAdapterConformance(
      new MemoryConformanceEnvironment(fault),
      fastTimeouts,
    );
    expect(report.ok).toBe(false);
    expect(report.results).toContainEqual(expect.objectContaining({ id: fixture, ok: false }));
  });
});
