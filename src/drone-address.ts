/**
 * gh#371 two-layer drone addressing — the shared short-uuid render helper.
 *
 * Lives in its own neutral module so BOTH the roster renderer
 * (roster-render.ts) and the read-log renderer (regen-format.ts
 * formatLogEntryMarkdown) import the SAME helper — one canonical token, no
 * cross-surface divergence (gh#371 decision-3). A drone's live LABEL renumbers
 * when cube membership changes (e.g. eighteen-of-28 → eighteen-of-30, which
 * bounced this cluster's own dispatches); the short-uuid is the STABLE address.
 */

/**
 * The stable short-uuid: the first 8 hex of the drone_id (UUID). It is, by
 * construction, a valid `startsWith` prefix of the full drone_id, so the
 * worker resolver (resolveDirectRecipientIds, gh#371 S1) matches it
 * cube-scoped. Lowercased to match the resolver's `/^[0-9a-f]{8,}$/i` guard.
 */
export function shortDroneId(droneId: string): string {
  return droneId.slice(0, 8).toLowerCase();
}

/**
 * The clearly-LABELED address token shown beside a drone on the roster and on
 * each read-log entry (gh#371 finding-2): `` `id:3336cde1` ``. Backticked so it
 * renders monospace — visually distinct from the plain `[entry_id: …]` bracket
 * that sits beside it in read-log, so a weak model never confuses which token
 * to `borg_ack` with (entry_id) versus address a dispatch to (`id:` short-uuid).
 */
export function formatDroneAddressToken(droneId: string): string {
  return `\`id:${shortDroneId(droneId)}\``;
}
