import type { EnrichedStreamEntry } from './types.js';
import {
  ProtocolContractError,
  decodeCanonicalTimestamp,
  decodeLogCursor,
  type LogCursor,
} from './contract.js';

export type StreamEvent =
  | { type: 'log'; cursor: LogCursor; entry: EnrichedStreamEntry }
  | {
      type: 'ack' | 'claim';
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

function stringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new ProtocolContractError(`Invalid SSE field "${name}".`);
  }
  return value;
}

export function encodeSseEvent(event: Exclude<StreamEvent, { type: 'unknown' }>): string {
  const lines = [`event: ${event.type}`];
  let data: Record<string, unknown>;
  if (event.type === 'log') {
    const cursor = decodeLogCursor(event.cursor);
    if (cursor.id !== event.entry.id) {
      throw new ProtocolContractError('Log event cursor id must match the entry id.');
    }
    lines.push(`id: ${cursor.id}`);
    data = { cursor, entry: event.entry };
  } else {
    const { type: _type, ...payload } = event;
    data = payload;
  }
  lines.push(`data: ${JSON.stringify(data)}`, '', '');
  return lines.join('\n');
}

export function decodeSseFrames(input: string): StreamEvent[] {
  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frames = normalized.split(/\n\n+/).filter((frame) => frame.trim() !== '');
  return frames.map(decodeFrame);
}

function decodeFrame(frame: string): StreamEvent {
  let eventName = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'id') id = value;
    else if (field === 'data') dataLines.push(value);
  }
  const rawData = dataLines.join('\n');
  if (!['log', 'ack', 'claim', 'heartbeat', 'bookmark'].includes(eventName)) {
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
    const cursor = decodeLogCursor(data.cursor, ['cursor']);
    if (cursor.id !== id) throw new ProtocolContractError('SSE id and cursor id differ.');
    const entry = object(data.entry) as unknown as EnrichedStreamEntry;
    if (entry.id !== id) throw new ProtocolContractError('SSE id and entry id differ.');
    return { type: 'log', cursor, entry };
  }

  if (id !== undefined) {
    throw new ProtocolContractError(`${eventName} SSE events must not carry a resume id.`);
  }

  if (eventName === 'ack' || eventName === 'claim') {
    return {
      type: eventName,
      log_entry_id: stringField(data.log_entry_id, 'log_entry_id'),
      actor_drone_id: stringField(data.actor_drone_id, 'actor_drone_id'),
      occurred_at: decodeCanonicalTimestamp(data.occurred_at, ['occurred_at']),
    };
  }
  if (eventName === 'heartbeat') {
    return {
      type: 'heartbeat',
      at: decodeCanonicalTimestamp(data.at, ['at']),
      broadcast_hwm: data.broadcast_hwm === null
        ? null
        : decodeLogCursor(data.broadcast_hwm, ['broadcast_hwm']),
    };
  }

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
