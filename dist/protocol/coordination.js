import { ProtocolContractError, compareLogCursor, decodeCanonicalTimestamp, decodeLogCursor, decodeProtocolEnvelope, decodeUuid, utf8ByteLength, } from './contract.js';
import { decodeEnrichedStreamEntry } from './sse.js';
function object(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ProtocolContractError('Expected a coordination object.');
    }
    return value;
}
function exact(value, allowed, required) {
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key))
            throw new ProtocolContractError(`Unknown coordination field "${key}".`);
    }
    for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            throw new ProtocolContractError(`Missing coordination field "${key}".`);
        }
    }
}
function boundedString(value, name, maximum) {
    if (typeof value !== 'string' || value.length === 0 || utf8ByteLength(value) > maximum) {
        throw new ProtocolContractError(`Invalid coordination field "${name}".`);
    }
    return value;
}
function nullableString(value, name, maximum) {
    return value === null ? null : boundedString(value, name, maximum);
}
function nonNegativeInteger(value, name, maximum) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
        throw new ProtocolContractError(`Invalid coordination field "${name}".`);
    }
    return value;
}
function positiveInteger(value, name, maximum) {
    const decoded = nonNegativeInteger(value, name, maximum);
    if (decoded === 0)
        throw new ProtocolContractError(`Invalid coordination field "${name}".`);
    return decoded;
}
function decodeManagedDrone(value) {
    const input = object(value);
    exact(input, ['id', 'cube_id', 'role_id', 'label'], ['id', 'cube_id', 'role_id', 'label']);
    return {
        id: decodeUuid(input.id, ['id']),
        cube_id: decodeUuid(input.cube_id, ['cube_id']),
        role_id: decodeUuid(input.role_id, ['role_id']),
        label: boundedString(input.label, 'label', 120),
    };
}
export function decodeReassignDroneRequest(value) {
    const input = object(value);
    exact(input, ['role_id'], ['role_id']);
    return { role_id: decodeUuid(input.role_id, ['role_id']) };
}
export function decodeReassignDroneRequestEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeReassignDroneRequest);
}
export function decodeReassignDroneResult(value) {
    const input = object(value);
    exact(input, ['drone'], ['drone']);
    return { drone: decodeManagedDrone(input.drone) };
}
export function decodeReassignDroneResultEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeReassignDroneResult);
}
export function decodeEvictDroneRequest(value) {
    const input = object(value);
    exact(input, [], []);
    return {};
}
export function decodeEvictDroneRequestEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeEvictDroneRequest);
}
export function decodeEvictDroneResult(value) {
    const input = object(value);
    exact(input, ['drone_id', 'evicted'], ['drone_id', 'evicted']);
    if (input.evicted !== true)
        throw new ProtocolContractError('Invalid drone eviction result.');
    return { drone_id: decodeUuid(input.drone_id, ['drone_id']), evicted: true };
}
export function decodeEvictDroneResultEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeEvictDroneResult);
}
export function decodeReadLogRequest(value) {
    const input = object(value);
    exact(input, ['cursor', 'limit'], ['cursor']);
    const output = {
        cursor: input.cursor === null ? null : decodeLogCursor(input.cursor, ['cursor']),
    };
    if (input.limit !== undefined)
        output.limit = positiveInteger(input.limit, 'limit', 500);
    return output;
}
export function decodeReadLogRequestEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeReadLogRequest);
}
function decodeClaimRecord(value) {
    const input = object(value);
    exact(input, [
        'log_entry_id',
        'claimant_drone_id',
        'claimant_label',
        'claimant_role',
        'claimed_at',
        'stale',
    ], [
        'log_entry_id',
        'claimant_drone_id',
        'claimant_label',
        'claimant_role',
        'claimed_at',
        'stale',
    ]);
    if (typeof input.stale !== 'boolean')
        throw new ProtocolContractError('Invalid claim stale flag.');
    return {
        log_entry_id: decodeUuid(input.log_entry_id, ['log_entry_id']),
        claimant_drone_id: decodeUuid(input.claimant_drone_id, ['claimant_drone_id']),
        claimant_label: nullableString(input.claimant_label, 'claimant_label', 120),
        claimant_role: nullableString(input.claimant_role, 'claimant_role', 120),
        claimed_at: decodeCanonicalTimestamp(input.claimed_at, ['claimed_at']),
        stale: input.stale,
    };
}
export function decodeAppendLogResult(value) {
    const input = object(value);
    exact(input, ['entry'], ['entry']);
    return { entry: decodeEnrichedStreamEntry(input.entry) };
}
export function decodeAppendLogResultEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeAppendLogResult);
}
export function decodeReadLogResult(value) {
    const input = object(value);
    exact(input, ['entries', 'cursor', 'behind_by', 'has_more', 'claims'], ['entries', 'cursor', 'behind_by', 'has_more', 'claims']);
    if (!Array.isArray(input.entries) || input.entries.length > 500) {
        throw new ProtocolContractError('Invalid read-log entries.');
    }
    if (!Array.isArray(input.claims) || input.claims.length > 500) {
        throw new ProtocolContractError('Invalid read-log claims.');
    }
    if (typeof input.has_more !== 'boolean')
        throw new ProtocolContractError('Invalid has_more flag.');
    const entries = input.entries.map(decodeEnrichedStreamEntry);
    const cursor = input.cursor === null ? null : decodeLogCursor(input.cursor, ['cursor']);
    for (let index = 1; index < entries.length; index++) {
        const previous = { id: entries[index - 1].id, created_at: entries[index - 1].created_at };
        const current = { id: entries[index].id, created_at: entries[index].created_at };
        if (compareLogCursor(previous, current) >= 0) {
            throw new ProtocolContractError('Read-log entries are not strictly cursor ordered.');
        }
    }
    if (entries.length > 0) {
        const last = entries.at(-1);
        if (cursor === null || cursor.id !== last.id || cursor.created_at !== last.created_at) {
            throw new ProtocolContractError('Read-log cursor must equal the final entry tuple.');
        }
    }
    return {
        entries,
        cursor,
        behind_by: nonNegativeInteger(input.behind_by, 'behind_by', Number.MAX_SAFE_INTEGER),
        has_more: input.has_more,
        claims: input.claims.map(decodeClaimRecord),
    };
}
export function decodeReadLogResultEnvelope(value) {
    return decodeProtocolEnvelope(value, decodeReadLogResult);
}
export function decodeDecision(value) {
    const input = object(value);
    exact(input, [
        'id',
        'cube_id',
        'topic',
        'decision',
        'rationale',
        'ratified_by',
        'status',
        'supersedes',
        'created_at',
    ], ['id', 'cube_id', 'topic', 'decision', 'rationale', 'status', 'supersedes', 'created_at']);
    if (!['active', 'superseded', 'removed'].includes(String(input.status))) {
        throw new ProtocolContractError('Invalid decision status.');
    }
    return {
        id: decodeUuid(input.id, ['id']),
        cube_id: decodeUuid(input.cube_id, ['cube_id']),
        topic: boundedString(input.topic, 'topic', 120),
        decision: boundedString(input.decision, 'decision', 2000),
        rationale: nullableString(input.rationale, 'rationale', 2000),
        ratified_by: input.ratified_by === undefined
            ? undefined
            : input.ratified_by === null
                ? null
                : decodeUuid(input.ratified_by, ['ratified_by']),
        status: input.status,
        supersedes: input.supersedes === null ? null : decodeUuid(input.supersedes, ['supersedes']),
        created_at: decodeCanonicalTimestamp(input.created_at, ['created_at']),
    };
}
export function decodeDecisionResultEnvelope(value) {
    return decodeProtocolEnvelope(value, (payload) => {
        const input = object(payload);
        exact(input, ['decision'], ['decision']);
        return { decision: decodeDecision(input.decision) };
    });
}
export function decodeDecisionsResultEnvelope(value) {
    return decodeProtocolEnvelope(value, (payload) => {
        const input = object(payload);
        exact(input, ['decisions'], ['decisions']);
        if (!Array.isArray(input.decisions) || input.decisions.length > 500) {
            throw new ProtocolContractError('Invalid decisions list.');
        }
        return { decisions: input.decisions.map(decodeDecision) };
    });
}
//# sourceMappingURL=coordination.js.map