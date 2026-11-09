import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_RECEIPT_CONFORMANCE,
  ErrorCode,
  ProtocolContractError,
  PROTOCOL_HTTP_CONTRACT,
  createProtocolEnvelope,
  decodeAttachmentReceipt,
  decodeReconcileAttachmentRequest,
  decodeReconcileAttachmentRequestEnvelope,
  decodeReconcileAttachmentResponse,
  decodeReconcileAttachmentResponseEnvelope,
  deriveAttachmentReceipt,
} from '../src/index.js';

const cube = '10000000-0000-4000-8000-000000000001';
const role = '20000000-0000-4000-8000-000000000001';
const drone = '30000000-0000-4000-8000-000000000001';
const session = '40000000-0000-4000-8000-000000000001';
const request = { receipt: 'a'.repeat(64), cube_id: cube, role_id: role, action: 'inspect' } as const;

describe('attachment receipt and reconciliation contract', () => {
  it('defines a parent-authenticated reconciliation route with distinct disposition conflicts', () => {
    expect(PROTOCOL_HTTP_CONTRACT.attach_reconcile).toEqual({
      method: 'POST', path: '/api/client/attach/reconcile', authenticated: 'client', success_status: 200,
    });
    expect(PROTOCOL_HTTP_CONTRACT.attachment_retired_status).toBe(409);
    expect(PROTOCOL_HTTP_CONTRACT.attachment_finalized_status).toBe(409);
  });
  it('hashes exact validated token text with the frozen domain, not decoded token bytes', async () => {
    for (const vector of ATTACHMENT_RECEIPT_CONFORMANCE) {
      expect(await deriveAttachmentReceipt(vector.input)).toBe(vector.expected);
      expect(createHash('sha256').update('borgmcp.attach-receipt.v1\0').update(vector.input).digest('hex'))
        .toBe(vector.expected);
      expect(createHash('sha256').update(vector.input).digest('hex')).not.toBe(vector.expected);
      expect(createHash('sha256').update('borgmcp.attach-receipt.v1').update(vector.input).digest('hex'))
        .not.toBe(vector.expected);
      expect(createHash('sha256').update('borgmcp.attach-receipt.v1\0')
        .update(Buffer.from(vector.input, 'base64url')).digest('hex')).not.toBe(vector.expected);
    }
    expect(await deriveAttachmentReceipt('A'.repeat(1024))).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(['', 'A'.repeat(42), 'A'.repeat(1025), `${'A'.repeat(43)}=`, ` ${'A'.repeat(43)}`, 'é'.repeat(43)])(
    'refuses invalid token text without normalization or echo', async (token) => {
      await expect(deriveAttachmentReceipt(token)).rejects.toThrow('Invalid attachment credential.');
    },
  );

  it.each([null, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 1])(
    'rejects noncanonical receipts', (receipt) => {
      expect(() => decodeAttachmentReceipt(receipt)).toThrow(ProtocolContractError);
    },
  );

  it('preserves absent prior distinctly from an exact supplied prior', () => {
    expect(decodeReconcileAttachmentRequest(request)).toEqual(request);
    expect(decodeReconcileAttachmentRequest(request)).not.toHaveProperty('prior_drone_id');
    expect(decodeReconcileAttachmentRequest({ ...request, prior_drone_id: drone }))
      .toEqual({ ...request, prior_drone_id: drone });
    for (const action of ['inspect', 'finalize', 'retire']) {
      expect(decodeReconcileAttachmentRequest({ ...request, action }).action).toBe(action);
    }
  });

  it('keeps malformed input, unknown-key and envelope diagnostics static and secret-free', () => {
    const fakeSecret = `synthetic-secret-${'S'.repeat(43)}`;
    for (const payload of [
      null, [], { ...request, prior_drone_id: null }, { ...request, prior_drone_id: fakeSecret },
      { ...request, receipt: fakeSecret }, { ...request, cube_id: fakeSecret },
      { ...request, action: fakeSecret }, { ...request, [fakeSecret]: fakeSecret },
      { ...request, action: undefined }, { ...request, prior_drone_id: undefined },
    ]) {
      for (const decode of [
        () => decodeReconcileAttachmentRequest(payload),
        () => decodeReconcileAttachmentRequestEnvelope(createProtocolEnvelope('request-1', payload)),
      ]) {
        expect(decode).toThrow('Invalid attachment reconciliation payload.');
        try { decode(); } catch (error) {
          expect(String(error)).not.toContain(fakeSecret);
          expect((error as ProtocolContractError).path).toEqual([]);
        }
      }
    }
    expect(() => decodeReconcileAttachmentRequestEnvelope({
      ...createProtocolEnvelope('request-1', request), [fakeSecret]: fakeSecret,
    })).toThrow('Invalid attachment reconciliation payload.');
    for (const decode of [
      () => decodeReconcileAttachmentResponse({ disposition: 'retired', [fakeSecret]: fakeSecret }, 'retire'),
      () => decodeReconcileAttachmentResponseEnvelope({
        ...createProtocolEnvelope('response-1', { disposition: 'retired' }), [fakeSecret]: fakeSecret,
      }, 'retire'),
    ]) expect(decode).toThrow('Invalid attachment reconciliation payload.');
  });

  it('requires exact result keys and the disposition allowed by the requested action', () => {
    const results = [
      { disposition: 'absent' },
      { disposition: 'accepted', drone_id: drone, session_id: session },
      { disposition: 'finalized', drone_id: drone, session_id: session },
      { disposition: 'retired' },
    ];
    for (const result of results) {
      expect(decodeReconcileAttachmentResponse(result, 'inspect')).toEqual(result);
      for (const action of ['finalize', 'retire'] as const) {
        if (result.disposition === (action === 'finalize' ? 'finalized' : 'retired')) {
          expect(decodeReconcileAttachmentResponseEnvelope(createProtocolEnvelope('response', result), action).payload)
            .toEqual(result);
        } else {
          expect(() => decodeReconcileAttachmentResponse(result, action)).toThrow(ProtocolContractError);
        }
      }
    }
    for (const result of [
      { disposition: 'absent', drone_id: drone }, { disposition: 'retired', session_id: session },
      { disposition: 'accepted', drone_id: drone },
      { disposition: 'finalized', drone_id: drone, session_id: 'not-a-uuid' },
      { ...results[1], receipt: request.receipt }, { disposition: 'unknown' },
    ]) expect(() => decodeReconcileAttachmentResponse(result, 'inspect')).toThrow(ProtocolContractError);
  });

  it('rejects the previous tag before decoding hostile payloads, not before server authentication', () => {
    const envelope = { protocol_version: '14', request_id: 'old-tag', payload: { ['S'.repeat(43)]: 'secret' } };
    for (const decode of [
      () => decodeReconcileAttachmentRequestEnvelope(envelope),
      () => decodeReconcileAttachmentResponseEnvelope(envelope, 'inspect'),
    ]) {
      expect(decode).toThrow('Unsupported protocol version.');
      try { decode(); } catch (error) {
        expect((error as ProtocolContractError).code).toBe(ErrorCode.UNSUPPORTED_PROTOCOL_VERSION);
      }
    }
    expect(decodeReconcileAttachmentRequestEnvelope(createProtocolEnvelope('current-tag', request)).payload)
      .toEqual(request);
  });
});
