/**
 * Shared short-UUID rendering keeps roster and activity-log addresses
 * consistent. A drone label may change as cube membership changes; the ID
 * prefix remains the stable address.
 */

/**
 * The stable short-uuid: the first 8 hex of the drone_id (UUID). It is, by
 * construction, a valid `startsWith` prefix of the full drone ID. It is
 * lowercased so case differences cannot create cross-surface drift.
 */
export function shortDroneId(droneId: string): string {
  return droneId.slice(0, 8).toLowerCase();
}

/**
 * The clearly-LABELED address token shown beside a drone on the roster and on
 * each read-log entry: `` `id:3336cde1` ``. Backticked so it
 * renders monospace — visually distinct from the plain `[entry_id: …]` bracket
 * that sits beside it in read-log, so a weak model never confuses which token
 * to `borg_ack` with (entry_id) versus address a dispatch to (`id:` short-uuid).
 */
export function formatDroneAddressToken(droneId: string): string {
  return `\`id:${shortDroneId(droneId)}\``;
}
