import { ErrorCode } from './errors.js';
import {
  ProtocolContractError,
  decodeCanonicalTimestamp,
  decodeOpaqueIdentifier,
  decodeProtocolEnvelope,
  decodeUuid,
  utf8ByteLength,
  type ProtocolEnvelope,
} from './contract.js';

export const DOCUMENT_CONTENT_TYPES = ['text/markdown', 'text/plain'] as const;
export const DOCUMENT_DEFAULT_MAX_BYTES = 65_536 as const;
export const DOCUMENT_DEFAULT_MAX_ACTIVE_BYTES_PER_CUBE = 524_288 as const;
export const DOCUMENT_MAX_BYTES_ENV = 'BORG_SERVER_MAX_DOCUMENT_BYTES' as const;
export const DOCUMENT_MAX_ACTIVE_BYTES_PER_CUBE_ENV =
  'BORG_SERVER_MAX_ACTIVE_DOCUMENT_BYTES_PER_CUBE' as const;
export type DocumentContentType = (typeof DOCUMENT_CONTENT_TYPES)[number];
export type DocumentState = 'active' | 'superseded' | 'removed';

export interface DocumentActor {
  drone_id: string | null;
  label: string | null;
  role: string | null;
}

export interface DocumentCitation {
  id: string;
  title: string;
  size_bytes: number;
  state: DocumentState;
}

export interface CubeDocumentMetadata extends DocumentCitation {
  content_type: DocumentContentType;
  supersedes: string | null;
  superseded_by: string | null;
  author: DocumentActor;
  created_at: string;
  removed_by: DocumentActor | null;
  removed_at: string | null;
}

export interface CubeDocument extends CubeDocumentMetadata {
  content: string;
}

export interface PutDocumentRequest {
  title: string;
  content_type: DocumentContentType;
  content: string;
  supersedes?: string;
}
export interface PutDocumentResult { document: CubeDocument }
export interface GetDocumentRequest { id: string }
export interface GetDocumentResult { document: CubeDocument }
export type ListDocumentsRequest = Record<string, never>;
export interface ListDocumentsResult { documents: CubeDocumentMetadata[] }
export interface RemoveDocumentRequest { id: string }
export interface RemoveDocumentResult { document: CubeDocumentMetadata }

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolContractError('Expected a document object.');
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ProtocolContractError(`Unknown document field "${key}".`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new ProtocolContractError(`Missing document field "${key}".`);
    }
  }
}

function text(value: unknown, field: string, maximumBytes: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || utf8ByteLength(value) > maximumBytes) {
    throw new ProtocolContractError(`Invalid document field "${field}".`);
  }
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new ProtocolContractError(`Invalid UTF-8 document field "${field}".`);
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ProtocolContractError(`Invalid UTF-8 document field "${field}".`);
    }
  }
  return value;
}

function title(value: unknown): string {
  const decoded = text(value, 'title', 480);
  if (Array.from(decoded).length > 120 || decoded !== decoded.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(decoded)) {
    throw new ProtocolContractError('Invalid document field "title".');
  }
  return decoded;
}

function contentType(value: unknown): DocumentContentType {
  if (!DOCUMENT_CONTENT_TYPES.includes(value as DocumentContentType)) {
    throw new ProtocolContractError(
      'Unsupported document content type.',
      ErrorCode.DOCUMENT_CONTENT_TYPE_UNSUPPORTED,
      ['content_type'],
    );
  }
  return value as DocumentContentType;
}

function count(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10 * 1024 * 1024) {
    throw new ProtocolContractError(`Invalid document field "${field}".`);
  }
  return value as number;
}

function nullableId(value: unknown, field: string): string | null {
  return value === null ? null : decodeOpaqueIdentifier(value, [field]);
}

function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field, 120);
}

export function decodeDocumentActor(value: unknown): DocumentActor {
  const input = object(value);
  exact(input, ['drone_id', 'label', 'role'], ['drone_id', 'label', 'role']);
  return {
    drone_id: input.drone_id === null ? null : decodeUuid(input.drone_id, ['drone_id']),
    label: nullableText(input.label, 'label'),
    role: nullableText(input.role, 'role'),
  };
}

export function decodeDocumentCitation(value: unknown): DocumentCitation {
  const input = object(value);
  exact(input, ['id', 'title', 'size_bytes', 'state'], ['id', 'title', 'size_bytes', 'state']);
  if (!['active', 'superseded', 'removed'].includes(String(input.state))) {
    throw new ProtocolContractError('Invalid document state.');
  }
  return {
    id: decodeOpaqueIdentifier(input.id, ['id']),
    title: title(input.title),
    size_bytes: count(input.size_bytes, 'size_bytes'),
    state: input.state as DocumentState,
  };
}

export function decodeDocumentCitations(value: unknown): DocumentCitation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ProtocolContractError('Document citations must contain 1-100 entries.');
  }
  const citations = value.map(decodeDocumentCitation);
  if (new Set(citations.map(({ id }) => id)).size !== citations.length) {
    throw new ProtocolContractError('Document citation ids must be unique.');
  }
  return citations;
}

export function decodeCubeDocumentMetadata(value: unknown): CubeDocumentMetadata {
  const input = object(value);
  exact(input, ['id', 'title', 'size_bytes', 'state', 'content_type', 'supersedes', 'superseded_by', 'author', 'created_at', 'removed_by', 'removed_at'], ['id', 'title', 'size_bytes', 'state', 'content_type', 'supersedes', 'superseded_by', 'author', 'created_at', 'removed_by', 'removed_at']);
  const citation = decodeDocumentCitation({ id: input.id, title: input.title, size_bytes: input.size_bytes, state: input.state });
  const removed = citation.state === 'removed';
  if (removed !== (input.removed_by !== null && input.removed_at !== null)) {
    throw new ProtocolContractError('Removed document audit fields do not match its state.');
  }
  if (citation.state === 'active' && input.superseded_by !== null) {
    throw new ProtocolContractError('Active document cannot have a superseding revision.');
  }
  if (citation.state === 'superseded' && input.superseded_by === null) {
    throw new ProtocolContractError('Superseded document must identify its next revision.');
  }
  return {
    ...citation,
    content_type: contentType(input.content_type),
    supersedes: nullableId(input.supersedes, 'supersedes'),
    superseded_by: nullableId(input.superseded_by, 'superseded_by'),
    author: decodeDocumentActor(input.author),
    created_at: decodeCanonicalTimestamp(input.created_at, ['created_at']),
    removed_by: input.removed_by === null ? null : decodeDocumentActor(input.removed_by),
    removed_at: input.removed_at === null ? null : decodeCanonicalTimestamp(input.removed_at, ['removed_at']),
  };
}

export function decodeCubeDocument(value: unknown): CubeDocument {
  const input = object(value);
  const content = text(input.content, 'content', 10 * 1024 * 1024, true);
  const { content: _content, ...metadataInput } = input;
  const metadata = decodeCubeDocumentMetadata(metadataInput);
  if (metadata.size_bytes !== utf8ByteLength(content)) throw new ProtocolContractError('Document size does not match its UTF-8 content.');
  return { ...metadata, content };
}

export function decodePutDocumentRequest(value: unknown): PutDocumentRequest {
  const input = object(value);
  exact(input, ['title', 'content_type', 'content', 'supersedes'], ['title', 'content_type', 'content']);
  const output: PutDocumentRequest = {
    title: title(input.title),
    content_type: contentType(input.content_type),
    content: text(input.content, 'content', 10 * 1024 * 1024, true),
  };
  if (input.supersedes !== undefined) output.supersedes = decodeOpaqueIdentifier(input.supersedes, ['supersedes']);
  return output;
}

export function decodeGetDocumentRequest(value: unknown): GetDocumentRequest {
  const input = object(value); exact(input, ['id'], ['id']);
  return { id: decodeOpaqueIdentifier(input.id, ['id']) };
}
export function decodeListDocumentsRequest(value: unknown): ListDocumentsRequest {
  const input = object(value); exact(input, [], []); return {};
}
export const decodeRemoveDocumentRequest = decodeGetDocumentRequest;

function oneDocument<T>(value: unknown, decode: (input: unknown) => T): { document: T } {
  const input = object(value); exact(input, ['document'], ['document']);
  return { document: decode(input.document) };
}
export const decodePutDocumentResult = (value: unknown): PutDocumentResult => {
  const result = oneDocument(value, decodeCubeDocument);
  if (result.document.state !== 'active' || result.document.removed_at !== null || result.document.removed_by !== null) {
    throw new ProtocolContractError('New document result must be active.');
  }
  return result;
};
export const decodeGetDocumentResult = (value: unknown): GetDocumentResult => oneDocument(value, decodeCubeDocument);
export const decodeRemoveDocumentResult = (value: unknown): RemoveDocumentResult => {
  const result = oneDocument(value, decodeCubeDocumentMetadata);
  if (result.document.state !== 'removed') throw new ProtocolContractError('Removed document result must be removed.');
  return result;
};
export function decodeListDocumentsResult(value: unknown): ListDocumentsResult {
  const input = object(value); exact(input, ['documents'], ['documents']);
  if (!Array.isArray(input.documents) || input.documents.length > 500) throw new ProtocolContractError('Invalid document list.');
  const documents = input.documents.map(decodeCubeDocumentMetadata);
  if (documents.some(({ state }) => state === 'removed')) throw new ProtocolContractError('Removed documents must be delisted.');
  return { documents };
}

export const decodePutDocumentRequestEnvelope = (value: unknown): ProtocolEnvelope<PutDocumentRequest> => decodeProtocolEnvelope(value, decodePutDocumentRequest);
export const decodePutDocumentResultEnvelope = (value: unknown): ProtocolEnvelope<PutDocumentResult> => decodeProtocolEnvelope(value, decodePutDocumentResult);
export const decodeGetDocumentRequestEnvelope = (value: unknown): ProtocolEnvelope<GetDocumentRequest> => decodeProtocolEnvelope(value, decodeGetDocumentRequest);
export const decodeGetDocumentResultEnvelope = (value: unknown): ProtocolEnvelope<GetDocumentResult> => decodeProtocolEnvelope(value, decodeGetDocumentResult);
export const decodeListDocumentsRequestEnvelope = (value: unknown): ProtocolEnvelope<ListDocumentsRequest> => decodeProtocolEnvelope(value, decodeListDocumentsRequest);
export const decodeListDocumentsResultEnvelope = (value: unknown): ProtocolEnvelope<ListDocumentsResult> => decodeProtocolEnvelope(value, decodeListDocumentsResult);
export const decodeRemoveDocumentRequestEnvelope = (value: unknown): ProtocolEnvelope<RemoveDocumentRequest> => decodeProtocolEnvelope(value, decodeRemoveDocumentRequest);
export const decodeRemoveDocumentResultEnvelope = (value: unknown): ProtocolEnvelope<RemoveDocumentResult> => decodeProtocolEnvelope(value, decodeRemoveDocumentResult);
