import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_CONFORMANCE,
  DOCUMENT_CONTENT_TYPES,
  ErrorCode,
  ProtocolContractError,
  createProtocolEnvelope,
  decodeCubeDocument,
  decodeListDocumentsResult,
  decodePutDocumentRequest,
  decodePutDocumentRequestEnvelope,
  decodeRemoveDocumentResult,
  utf8ByteLength,
} from '../src/index.js';

const actor = {
  drone_id: '10000000-0000-4000-8000-000000000001',
  label: 'builder-a076b44a',
  role: 'Builder',
};
const metadata = {
  id: 'doc_opaque_full_id',
  title: 'Review evidence',
  content_type: 'text/markdown' as const,
  size_bytes: utf8ByteLength('Evidence: €'),
  state: 'active' as const,
  supersedes: null,
  superseded_by: null,
  author: actor,
  created_at: '2026-08-15T08:00:00.000Z',
  removed_by: null,
  removed_at: null,
};

describe('cube document contract', () => {
  it('accepts only the two UTF-8 text types and bounds titles by code points', () => {
    expect(DOCUMENT_CONTENT_TYPES).toEqual(['text/markdown', 'text/plain']);
    expect(decodePutDocumentRequest({
      title: '😀'.repeat(120),
      content_type: 'text/plain',
      content: 'Evidence: €',
    })).toEqual({ title: '😀'.repeat(120), content_type: 'text/plain', content: 'Evidence: €' });
    expect(() => decodePutDocumentRequest({
      title: 'x'.repeat(121), content_type: 'text/plain', content: '',
    })).toThrow(ProtocolContractError);
    expect(() => decodePutDocumentRequest({
      title: 'Binary', content_type: 'application/octet-stream', content: 'AA==',
    })).toThrow(ProtocolContractError);
    expect(() => decodePutDocumentRequest({
      title: 'Broken', content_type: 'text/plain', content: '\ud800',
    })).toThrow('Invalid UTF-8');
  });

  it('strictly decodes immutable content, UTF-8 size, and full opaque links', () => {
    const document = { ...metadata, content: 'Evidence: €' };
    expect(decodeCubeDocument(document)).toEqual(document);
    expect(() => decodeCubeDocument({ ...document, size_bytes: 11 })).toThrow('size');
    expect(decodePutDocumentRequestEnvelope(createProtocolEnvelope('document-put', {
      title: metadata.title,
      content_type: metadata.content_type,
      content: document.content,
      supersedes: 'doc_previous_full_id',
    })).payload.supersedes).toBe('doc_previous_full_id');
  });

  it('delists removed documents while retaining auditable exact-id metadata', () => {
    expect(decodeListDocumentsResult({ documents: [metadata] })).toEqual({ documents: [metadata] });
    const removed = {
      ...metadata,
      state: 'removed' as const,
      removed_by: actor,
      removed_at: '2026-08-15T08:01:00.000Z',
    };
    expect(decodeRemoveDocumentResult({ document: removed })).toEqual({ document: removed });
    expect(() => decodeRemoveDocumentResult({
      document: { ...removed, removed_by: null },
    })).toThrow(ProtocolContractError);
  });

  it('exports portable vectors and typed fail-closed error classes', () => {
    expect(DOCUMENT_CONFORMANCE).toHaveLength(8);
    for (const code of [
      'DOCUMENT_NOT_FOUND',
      'DOCUMENT_CONTENT_TYPE_UNSUPPORTED',
      'DOCUMENT_BUDGET_EXCEEDED',
      'DOCUMENT_SUPERSESSION_INVALID',
      'DOCUMENT_REMOVE_DENIED',
    ] as const) expect(ErrorCode[code]).toBe(code);
  });
});
