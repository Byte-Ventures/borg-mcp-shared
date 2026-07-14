export function shortDroneId(droneId) {
    return droneId.slice(0, 8).toLowerCase();
}
export function formatDroneAddressToken(droneId) {
    return `\`id:${shortDroneId(droneId)}\``;
}
//# sourceMappingURL=drone-address.js.map