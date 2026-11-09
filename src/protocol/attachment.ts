import {
  ProtocolContractError,
  decodeProtocolEnvelope,
  decodeUuid,
  type ProtocolEnvelope,
} from './contract.js';
import { ErrorCode } from './errors.js';

/** Internal correlation only: never a credential, printed handle, or bearer recovery mechanism. */
export const ATTACHMENT_RECEIPT_DOMAIN = 'borgmcp.attach-receipt.v1\0' as const;
export const ATTACHMENT_RETIRED_MESSAGE = 'Attachment has been retired.' as const;
export const ATTACHMENT_FINALIZED_MESSAGE = 'Finalized attachments cannot be retired by pending-attachment recovery.' as const;

/** SHA-256(domain bytes || exact token text bytes), lowercase hex; no base64 decoding. */
export async function deriveAttachmentReceipt(sessionCredential: string): Promise<string> {
  if (typeof sessionCredential !== 'string' || sessionCredential.length < 43 ||
      sessionCredential.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(sessionCredential)) {
    throw new ProtocolContractError('Invalid attachment credential.');
  }
  // Domain and validated token are ASCII, so UTF-8 is exactly one byte per character.
  const input = Uint8Array.from(ATTACHMENT_RECEIPT_DOMAIN + sessionCredential, (character) => character.charCodeAt(0));
  const crypto = (globalThis as {
    crypto?: { subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } };
  }).crypto;
  if (!crypto) throw new Error('Web Crypto SHA-256 support is required.');
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type ReconcileAttachmentAction = 'inspect' | 'finalize' | 'retire';

export interface ReconcileAttachmentRequest {
  receipt: string;
  cube_id: string;
  role_id: string;
  action: ReconcileAttachmentAction;
  /** Omitted means the original attach had no prior drone; never a wildcard. */
  prior_drone_id?: string;
}

export type ReconcileAttachmentResponse =
  | { disposition: 'absent' }
  | { disposition: 'accepted' | 'finalized'; drone_id: string; session_id: string }
  | { disposition: 'retired' };

function invalid(): never {
  throw new ProtocolContractError('Invalid attachment reconciliation payload.');
}

/** Even malformed field names may contain a bearer/receipt: never interpolate them or their paths. */
function safe<T>(decode: () => T): T {
  try {
    return decode();
  } catch (error) {
    if (error instanceof ProtocolContractError && error.code === ErrorCode.UNSUPPORTED_PROTOCOL_VERSION) {
      throw new ProtocolContractError('Unsupported protocol version.', ErrorCode.UNSUPPORTED_PROTOCOL_VERSION, ['protocol_version']);
    }
    return invalid();
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function exact(input: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(input, key)) ||
      Object.keys(input).some((key) => !required.includes(key) && !optional.includes(key))) invalid();
}

export function decodeAttachmentReceipt(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) invalid();
  return value;
}

export function decodeReconcileAttachmentRequest(value: unknown): ReconcileAttachmentRequest {
  return safe(() => {
    const input = object(value);
    exact(input, ['receipt', 'cube_id', 'role_id', 'action'], ['prior_drone_id']);
    if (input.action !== 'inspect' && input.action !== 'finalize' && input.action !== 'retire') invalid();
    const result: ReconcileAttachmentRequest = {
      receipt: decodeAttachmentReceipt(input.receipt),
      cube_id: decodeUuid(input.cube_id),
      role_id: decodeUuid(input.role_id),
      action: input.action,
    };
    if (Object.prototype.hasOwnProperty.call(input, 'prior_drone_id')) {
      result.prior_drone_id = decodeUuid(input.prior_drone_id);
    }
    return result;
  });
}

/** Require the action as well as the wire union, so a mismatched success cannot authorize cleanup. */
export function decodeReconcileAttachmentResponse(
  value: unknown,
  action: ReconcileAttachmentAction,
): ReconcileAttachmentResponse {
  return safe(() => {
    const input = object(value);
    if (action !== 'inspect' && action !== 'finalize' && action !== 'retire') invalid();
    if (action === 'finalize' && input.disposition !== 'finalized') invalid();
    if (action === 'retire' && input.disposition !== 'retired') invalid();
    if (input.disposition === 'absent' || input.disposition === 'retired') {
      exact(input, ['disposition']);
      return { disposition: input.disposition };
    }
    if (input.disposition !== 'accepted' && input.disposition !== 'finalized') invalid();
    exact(input, ['disposition', 'drone_id', 'session_id']);
    return {
      disposition: input.disposition,
      drone_id: decodeUuid(input.drone_id),
      session_id: decodeUuid(input.session_id),
    };
  });
}

export function decodeReconcileAttachmentRequestEnvelope(value: unknown): ProtocolEnvelope<ReconcileAttachmentRequest> {
  return safe(() => decodeProtocolEnvelope(value, decodeReconcileAttachmentRequest));
}

export function decodeReconcileAttachmentResponseEnvelope(
  value: unknown,
  action: ReconcileAttachmentAction,
): ProtocolEnvelope<ReconcileAttachmentResponse> {
  return safe(() => decodeProtocolEnvelope(value, (payload) => decodeReconcileAttachmentResponse(payload, action)));
}
