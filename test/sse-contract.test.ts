import { describe, expect, it } from 'vitest';
import {
  ProtocolContractError,
  compareLogCursor,
  decodeSseFrames,
  encodeSseEvent,
  maxLogCursor,
} from '../src/index.js';

const cursorA = {
  id: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-07-14T10:00:00.000Z',
};
const cursorB = {
  id: '00000000-0000-4000-8000-000000000002',
  created_at: '2026-07-14T10:00:00.000Z',
};

describe('strict cursor semantics', () => {
  it('orders by timestamp and id without regressing', () => {
    expect(compareLogCursor(cursorA, cursorB)).toBe(-1);
    expect(maxLogCursor(cursorB, cursorA)).toEqual(cursorB);
    expect(maxLogCursor(null, cursorA)).toEqual(cursorA);
  });

  it('rejects invalid timestamps instead of silently using lexical ordering', () => {
    expect(() => compareLogCursor({ ...cursorA, created_at: 'not-a-date' }, cursorB)).toThrow(
      ProtocolContractError,
    );
  });

  it('rejects cursor identifiers containing SSE control characters', () => {
    for (const suffix of ['\r\nevent: injected', '\nInjected: yes', '\0hidden']) {
      expect(() =>
        compareLogCursor({ ...cursorA, id: `${cursorA.id}${suffix}` }, cursorB),
      ).toThrow(ProtocolContractError);
    }
  });
});

describe('SSE wire codec', () => {
  it('round-trips a cursor-bearing log event', () => {
    const encoded = encodeSseEvent({
      type: 'log',
      cursor: cursorA,
      entry: {
        id: cursorA.id,
        cube_id: '10000000-0000-4000-8000-000000000001',
        drone_id: '20000000-0000-4000-8000-000000000001',
        message: 'hello',
        visibility: 'broadcast',
        created_at: cursorA.created_at,
        drone_label: 'one-of-one-builder',
        role_name: 'Builder',
        recipient_drone_ids: [],
      },
    });

    expect(encoded).toContain(`id: ${cursorA.id}`);
    expect(decodeSseFrames(encoded)).toHaveLength(1);
    expect(decodeSseFrames(encoded)[0]).toMatchObject({
      type: 'log',
      cursor: cursorA,
    });
  });

  it('never emits resume ids for ack or claim events', () => {
    for (const event of [
      {
        type: 'ack' as const,
        log_entry_id: cursorA.id,
        actor_drone_id: '20000000-0000-4000-8000-000000000001',
        occurred_at: cursorA.created_at,
      },
      {
        type: 'claim' as const,
        log_entry_id: cursorA.id,
        actor_drone_id: '20000000-0000-4000-8000-000000000001',
        occurred_at: cursorA.created_at,
      },
    ]) {
      const encoded = encodeSseEvent(event);
      expect(encoded).not.toMatch(/^id:/m);
      expect(decodeSseFrames(encoded)).toEqual([event]);
    }
  });

  it('parses CRLF framing, comments, and multi-line data', () => {
    const frame = [
      ': keepalive',
      'event: heartbeat',
      'data: {"at":"2026-07-14T10:00:00.000Z",',
      'data: "broadcast_hwm":null}',
      '',
      '',
    ].join('\r\n');

    expect(decodeSseFrames(frame)).toEqual([
      {
        type: 'heartbeat',
        at: '2026-07-14T10:00:00.000Z',
        broadcast_hwm: null,
      },
    ]);
  });

  it('requires a resume id on log events', () => {
    expect(() =>
      decodeSseFrames('event: log\ndata: {"entry":{}}\n\n'),
    ).toThrow(ProtocolContractError);
  });

  it('rejects cursor timestamps that differ from the log entry timestamp', () => {
    const entry = {
      id: cursorA.id,
      cube_id: '10000000-0000-4000-8000-000000000001',
      drone_id: '20000000-0000-4000-8000-000000000001',
      message: 'hello',
      visibility: 'broadcast' as const,
      created_at: '2026-07-14T10:00:01.000Z',
      drone_label: 'one-of-one-builder',
      role_name: 'Builder',
      recipient_drone_ids: [],
    };
    expect(() => encodeSseEvent({ type: 'log', cursor: cursorA, entry })).toThrow(
      ProtocolContractError,
    );
    expect(() =>
      decodeSseFrames(
        `event: log\nid: ${cursorA.id}\ndata: ${JSON.stringify({ cursor: cursorA, entry })}\n\n`,
      ),
    ).toThrow(ProtocolContractError);
  });

  it('rejects oversized streams, frames, and unknown-event data', () => {
    expect(() => decodeSseFrames('x'.repeat(1_048_577))).toThrow(ProtocolContractError);
    expect(() =>
      decodeSseFrames(`event: unknown\ndata: ${'x'.repeat(4097)}\n\n`),
    ).toThrow(ProtocolContractError);
  });

  it('rejects extra event fields and malformed enriched entries', () => {
    expect(() =>
      decodeSseFrames(
        `event: heartbeat\ndata: {"at":"2026-07-14T10:00:00.000Z","broadcast_hwm":null,"token":"secret"}\n\n`,
      ),
    ).toThrow(ProtocolContractError);

    expect(() =>
      decodeSseFrames(
        `event: log\nid: ${cursorA.id}\ndata: ${JSON.stringify({
          cursor: cursorA,
          entry: {
            id: cursorA.id,
            cube_id: 'cube-1',
            drone_id: null,
            message: 'x'.repeat(10_241),
            visibility: 'broadcast',
            created_at: cursorA.created_at,
            drone_label: null,
            role_name: null,
            recipient_drone_ids: [],
          },
        })}\n\n`,
      ),
    ).toThrow(ProtocolContractError);
  });
});
