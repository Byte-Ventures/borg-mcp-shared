import type { MessageTaxonomy } from '../templates.js';
export type AgentKind = 'claude' | 'codex' | 'opencode';
export type RoleClass = 'queen' | 'worker';
export type LogVisibility = 'broadcast' | 'direct';
export type AckKind = 'ack' | 'claim';
export type WakePath = 'live' | 'degraded' | 'deaf';
export type WakePathAlertClass = 'dead' | 'post-blocked' | 'presumed-dead' | 'systemic-post-block' | 'wake-path-deaf' | 'systemic-wake-path-deaf' | 'independent';
export interface Cube {
    id: string;
    owner_id: string;
    name: string;
    cube_directive: string;
    created_at: string;
    updated_at: string;
    message_taxonomy?: MessageTaxonomy | null;
    directive_hash?: string;
}
export interface Role {
    id: string;
    cube_id: string;
    name: string;
    short_description: string;
    detailed_description: string;
    is_default: boolean;
    is_mandatory?: boolean;
    is_human_seat: boolean;
    can_broadcast?: boolean;
    receives_all_direct?: boolean;
    role_class?: RoleClass;
    created_at: string;
    detailed_description_hash?: string;
}
export type PublicRole = Omit<Role, 'detailed_description' | 'detailed_description_hash'>;
export interface Drone {
    id: string;
    cube_id: string;
    role_id: string;
    label: string;
    is_queen_class?: boolean;
    last_seen: string;
    last_log_post?: string | null;
    hostname: string | null;
    last_regen_at?: string | null;
    regen_count?: number | string;
    last_read_log_at?: string | null;
    last_event_received_at?: string | null;
    wake_path_client_sse_connected?: boolean | null;
    wake_path_client_monitor_armed?: boolean | null;
    wake_path_alert_class?: WakePathAlertClass | null;
    agent_kind?: AgentKind | null;
    reported_model?: string | null;
    working_repo_name?: string | null;
    working_repo_origin?: string | null;
    evicted_at?: null;
    created_at: string;
    seen_since?: boolean;
}
export interface RosterDrone extends Drone {
    behind_by: number;
    wake_path: WakePath;
    wake_path_deaf_streak?: number;
    wake_path_last_challenge_at?: string | null;
    wake_path_last_alert_at?: string | null;
}
export interface RegenIdentityDrone extends Drone {
    frozen_at?: null;
}
export interface ActivityLogEntry {
    id: string;
    cube_id: string;
    drone_id: string | null;
    message: string;
    visibility: LogVisibility;
    created_at: string;
}
export interface EnrichedStreamEntry extends ActivityLogEntry {
    drone_label: string | null;
    role_name: string | null;
    recipient_drone_ids: string[];
}
export interface AssimilateRequest {
    cube_id?: string;
    cube_name?: string;
    role_id?: string;
    role_name?: string;
    prior_drone_id?: string;
    hostname?: string | null;
    agent_kind?: AgentKind | null;
}
export interface AssimilateResponse {
    cube: Cube;
    role: Role;
    drone: Drone;
    sessionToken: string;
    reattached?: boolean;
}
export interface WhoAmIResponse {
    cube_id: string;
    cube_name: string;
    drone_id: string;
    drone_label: string;
    role_id: string;
    role_name: string;
}
export interface RosterResponse {
    drones: RosterDrone[];
    roles: PublicRole[];
    message_taxonomy?: MessageTaxonomy | null;
    since?: string | null;
}
export interface ReadLogClaim {
    log_entry_id: string;
    claimant_drone_id: string;
    claimant_label: string | null;
    claimant_role: string | null;
    claimed_at: string;
    stale: boolean;
}
export interface ReadLogResponse {
    entries: ActivityLogEntry[];
    drones: Drone[];
    roles: PublicRole[];
    behind_by?: number;
    has_more?: boolean;
    claims?: ReadLogClaim[];
}
export interface RoutingEcho {
    class: string | null;
    recipients: string[];
    fellOpen: boolean;
    message: string | null;
}
export interface AppendLogRequest {
    message: string;
    visibility?: LogVisibility;
    recipientDroneIds?: string[];
    class?: string;
    to?: string[];
}
export interface AppendLogResponse {
    entry: ActivityLogEntry;
    routing?: RoutingEcho | null;
    unreachableRecipients?: Array<{
        id: string;
        label: string;
    }>;
}
export interface Decision {
    id: string;
    cube_id: string;
    topic: string;
    decision: string;
    rationale: string | null;
    ratified_by?: string | null;
    status?: 'active' | 'superseded' | 'removed';
    supersedes?: string | null;
    created_at: string;
}
export interface RecordDecisionRequest {
    topic: string;
    decision: string;
    rationale?: string;
}
export interface RegenResponse {
    cube: Cube;
    role: Role;
    drone: RegenIdentityDrone;
    roles: PublicRole[];
    drones: Drone[];
    decisions?: Decision[];
    recentLog?: ActivityLogEntry[];
    behind_by?: number;
}
//# sourceMappingURL=types.d.ts.map