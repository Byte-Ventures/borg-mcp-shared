/** Stable machine-readable error codes used by Borg MCP servers and clients. */
export enum ErrorCode {
  AUTH_MISSING = 'AUTH_MISSING',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  CONTENT_TOO_LARGE = 'CONTENT_TOO_LARGE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  ROLE_IN_USE = 'ROLE_IN_USE',
  ROLE_HAS_FROZEN_DRONES = 'ROLE_HAS_FROZEN_DRONES',
  DRONE_EVICTED = 'DRONE_EVICTED',
  DRONE_FROZEN = 'DRONE_FROZEN',
  UNSUPPORTED_PROTOCOL_VERSION = 'UNSUPPORTED_PROTOCOL_VERSION',
  CURSOR_INVALID = 'CURSOR_INVALID',
  CURSOR_EXPIRED = 'CURSOR_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  /**
   * The presented session bearer does not match the seat it targets: a fresh or
   * non-matching bearer against an already-bound active seat. Distinct from
   * SESSION_REVOKED (a formerly valid credential that was explicitly revoked).
   * AUTH_EXPIRED is the only recoverable expired-session outcome. Carried by the
   * server's typed 401 takeover rejection.
   */
  SESSION_REJECTED = 'SESSION_REJECTED',
}

/** @deprecated Wire failures use the versioned ProtocolErrorEnvelope. */
export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: string;
  /** Number of seconds a rate-limited caller should wait. */
  retryAfter?: number;
}
