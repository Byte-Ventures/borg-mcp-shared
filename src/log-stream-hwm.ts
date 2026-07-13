export interface BroadcastHwm {
  id: string;
  created_at: string;
}

export function compareBroadcastHwm(a: BroadcastHwm, b: BroadcastHwm): number {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime - bTime;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}
