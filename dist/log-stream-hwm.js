export function compareBroadcastHwm(a, b) {
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
//# sourceMappingURL=log-stream-hwm.js.map