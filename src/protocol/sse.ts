import type { EnrichedStreamEntry } from './types.js';
import {
  ProtocolContractError,
  decodeCanonicalTimestamp,
  decodeLogCursor,
  decodeOpaqueIdentifier,
  decodeUuid,
  type LogCursor,
} from './contract.js';

export const SSE_LIMITS = {
  total_bytes: 1024 * 1024,
  frame_bytes: 65_536,
  data_bytes: 65_536,
  frame_count: 1000,
  unknown_data_bytes: 4096,
} as const;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
             value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else bytes += 3;
  }
  return bytes;
}

export type StreamEvent =
  | { type: 'log'; cursor: LogCursor; entry: EnrichedStreamEntry }
  | {
      type: 'ack';
      log_entry_id: string;
      actor_drone_id: string;
      occurred_at: string;
    }
  | {
      type: 'claim';
      log_entry_id: string;
      actor_drone_id: string;
      occurred_at: string;
    }
  | { type: 'heartbeat'; at: string; broadcast_hwm: LogCursor | null }
  | {
      type: 'bookmark';
      as_of: string;
      replay_complete: boolean;
      next_cursor?: LogCursor;
      cursor_status?: 'valid' | 'expired' | 'unknown';
    }
  | { type: 'unknown'; event: string; raw_data: string };

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolContractError('SSE data must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ProtocolContractError(`Unknown SSE data field "${key}".`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new ProtocolContractError(`Missing SSE data field "${key}".`);
    }
  }
}

function boundedString(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new ProtocolContractError(`Invalid SSE field "${name}".`);
  }
  return value;
}

function nullableString(value: unknown, name: string, maximum: number): string | null {
  return value === null ? null : boundedString(value, name, maximum);
}

function decodeEnrichedEntry(value: unknown): EnrichedStreamEntry {
  const entry = object(value);
  exactKeys(
    entry,
    [
      'id',
      'cube_id',
      'drone_id',
      'message',
      'visibility',
      'created_at',
      'drone_label',
      'role_name',
      'recipient_drone_ids',
    ],
    [
      'id',
      'cube_id',
      'drone_id',
      'message',
      'visibility',
      'created_at',
      'drone_label',
      'role_name',
      'recipient_drone_ids',
    ],
  );
  if (entry.visibility !== 'broadcast' && entry.visibility !== 'direct') {
    throw new ProtocolContractError('Invalid SSE log visibility.');
  }
  if (!Array.isArray(entry.recipient_drone_ids) || entry.recipient_drone_ids.length > 100) {
    throw new ProtocolContractError('Invalid SSE recipient list.');
  }
  return {
    id: decodeUuid(entry.id, ['entry', 'id']),
    cube_id: decodeUuid(entry.cube_id, ['entry', 'cube_id']),
    drone_id: entry.drone_id === null ? null : decodeUuid(entry.drone_id, ['entry', 'drone_id']),
    message: boundedString(entry.message, 'message', 10_240),
    visibility: entry.visibility,
    created_at: decodeCanonicalTimestamp(entry.created_at, ['entry', 'created_at']),
    drone_label: nullableString(entry.drone_label, 'drone_label', 120),
    role_name: nullableString(entry.role_name, 'role_name', 120),
    recipient_drone_ids: entry.recipient_drone_ids.map((id, index) =>
      decodeUuid(id, ['entry', 'recipient_drone_ids', index])
    ),
  };
}

export function encodeSseEvent(event: Exclude<StreamEvent, { type: 'unknown' }>): string {
  const lines = [`event: ${event.type}`];
  let data: Record<string, unknown>;
  if (event.type === 'log') {
    const cursor = decodeLogCursor(event.cursor);
    const entry = decodeEnrichedEntry(event.entry);
    if (cursor.id !== entry.id) {
      throw new ProtocolContractError('Log event cursor id must match the entry id.');
    }
    if (/[\r\n\0]/.test(cursor.id)) {
      throw new ProtocolContractError('SSE id contains a forbidden control character.');
    }
    lines.push(`id: ${cursor.id}`);
    data = { cursor, entry };
  } else if (event.type === 'ack' || event.type === 'claim') {
    data = {
      log_entry_id: decodeUuid(event.log_entry_id, ['log_entry_id']),
      actor_drone_id: decodeUuid(event.actor_drone_id, ['actor_drone_id']),
      occurred_at: decodeCanonicalTimestamp(event.occurred_at, ['occurred_at']),
    };
  } else if (event.type === 'heartbeat') {
    data = {
      at: decodeCanonicalTimestamp(event.at, ['at']),
      broadcast_hwm: event.broadcast_hwm === null ? null : decodeLogCursor(event.broadcast_hwm),
    };
  } else {
    if (typeof event.replay_complete !== 'boolean') {
      throw new ProtocolContractError('Bookmark replay_complete must be boolean.');
    }
    if (event.cursor_status !== undefined &&
        !['valid', 'expired', 'unknown'].includes(event.cursor_status)) {
      throw new ProtocolContractError('Invalid bookmark cursor_status.');
    }
    data = {
      as_of: decodeCanonicalTimestamp(event.as_of, ['as_of']),
      replay_complete: event.replay_complete,
      ...(event.next_cursor ? { next_cursor: decodeLogCursor(event.next_cursor) } : {}),
      ...(event.cursor_status ? { cursor_status: event.cursor_status } : {}),
    };
  }
  lines.push(`data: ${JSON.stringify(data)}`, '', '');
  return lines.join('\n');
}

/**
 * Decode a bounded in-memory SSE batch. Network adapters MUST enforce the same
 * limits while reading from the socket; this decoder is not a substitute for
 * aborting an oversized response before it is fully buffered.
 */
export function decodeSseFrames(input: string): StreamEvent[] {
  if (utf8ByteLength(input) > SSE_LIMITS.total_bytes) {
    throw new ProtocolContractError('SSE input exceeds the total byte limit.');
  }
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frames = normalized.split(/\n\n+/).filter((frame) => frame.trim() !== '');
  if (frames.length > SSE_LIMITS.frame_count) {
    throw new ProtocolContractError('SSE input exceeds the frame count limit.');
  }
  for (const frame of frames) {
    if (utf8ByteLength(frame) > SSE_LIMITS.frame_bytes) {
      throw new ProtocolContractError('SSE frame exceeds the byte limit.');
    }
  }
  return frames.map(decodeFrame);
}

function decodeFrame(frame: string): StreamEvent {
  let eventName = 'message';
  let id: string | undefined;
  let eventSeen = false;
  let idSeen = false;
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') {
      if (eventSeen) throw new ProtocolContractError('Duplicate SSE event field.');
      eventSeen = true;
      eventName = decodeOpaqueIdentifier(value, ['event']);
    } else if (field === 'id') {
      if (idSeen) throw new ProtocolContractError('Duplicate SSE id field.');
      idSeen = true;
      id = decodeUuid(value, ['id']);
    }
    else if (field === 'data') dataLines.push(value);
    else throw new ProtocolContractError(`Unsupported SSE field "${field}".`);
  }
  const rawData = dataLines.join('\n');
  const rawDataBytes = utf8ByteLength(rawData);
  if (rawDataBytes > SSE_LIMITS.data_bytes) {
    throw new ProtocolContractError('SSE data exceeds the byte limit.');
  }
  if (!['log', 'ack', 'claim', 'heartbeat', 'bookmark'].includes(eventName)) {
    if (rawDataBytes > SSE_LIMITS.unknown_data_bytes) {
      throw new ProtocolContractError('Unknown SSE event data exceeds the byte limit.');
    }
    return { type: 'unknown', event: eventName, raw_data: rawData };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    throw new ProtocolContractError(`Invalid JSON in SSE ${eventName} event.`);
  }
  const data = object(parsed);

  if (eventName === 'log') {
    if (!id) throw new ProtocolContractError('Log SSE events require an id field.');
    exactKeys(data, ['cursor', 'entry'], ['cursor', 'entry']);
    const cursor = decodeLogCursor(data.cursor, ['cursor']);
    if (cursor.id !== id) throw new ProtocolContractError('SSE id and cursor id differ.');
    const entry = decodeEnrichedEntry(data.entry);
    if (entry.id !== id) throw new ProtocolContractError('SSE id and entry id differ.');
    return { type: 'log', cursor, entry };
  }

  if (id !== undefined) {
    throw new ProtocolContractError(`${eventName} SSE events must not carry a resume id.`);
  }

  if (eventName === 'ack' || eventName === 'claim') {
    exactKeys(data, ['log_entry_id', 'actor_drone_id', 'occurred_at'], [
      'log_entry_id',
      'actor_drone_id',
      'occurred_at',
    ]);
    return {
      type: eventName,
      log_entry_id: decodeUuid(data.log_entry_id, ['log_entry_id']),
      actor_drone_id: decodeUuid(data.actor_drone_id, ['actor_drone_id']),
      occurred_at: decodeCanonicalTimestamp(data.occurred_at, ['occurred_at']),
    };
  }
  if (eventName === 'heartbeat') {
    exactKeys(data, ['at', 'broadcast_hwm'], ['at', 'broadcast_hwm']);
    return {
      type: 'heartbeat',
      at: decodeCanonicalTimestamp(data.at, ['at']),
      broadcast_hwm: data.broadcast_hwm === null
        ? null
        : decodeLogCursor(data.broadcast_hwm, ['broadcast_hwm']),
    };
  }

  exactKeys(
    data,
    ['as_of', 'replay_complete', 'next_cursor', 'cursor_status'],
    ['as_of', 'replay_complete'],
  );
  if (typeof data.replay_complete !== 'boolean') {
    throw new ProtocolContractError('Bookmark replay_complete must be boolean.');
  }
  const bookmark: Extract<StreamEvent, { type: 'bookmark' }> = {
    type: 'bookmark',
    as_of: decodeCanonicalTimestamp(data.as_of, ['as_of']),
    replay_complete: data.replay_complete,
  };
  if (data.next_cursor !== undefined) bookmark.next_cursor = decodeLogCursor(data.next_cursor);
  if (data.cursor_status !== undefined) {
    if (!['valid', 'expired', 'unknown'].includes(String(data.cursor_status))) {
      throw new ProtocolContractError('Invalid bookmark cursor_status.');
    }
    bookmark.cursor_status = data.cursor_status as 'valid' | 'expired' | 'unknown';
  }
  return bookmark;
}
