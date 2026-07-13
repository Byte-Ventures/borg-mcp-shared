import type { MessageTaxonomy } from '../templates.js';

export type AgentKind = 'claude' | 'codex' | 'opencode';
export type RoleClass = 'queen' | 'worker';
export type LogVisibility = 'broadcast' | 'direct';
export type AckKind = 'ack' | 'claim';

export interface Cube {
  id: string;
  owner_id: string;
  name: string;
  cube_directive: string;
  created_at: string;
  updated_at: string;
  message_taxonomy?: MessageTaxonomy | null;
}

export interface Role {
  id: string;
  cube_id: string;
  name: string;
  short_description: string;
  detailed_description: string;
  is_default: boolean;
  is_human_seat: boolean;
  role_class: RoleClass;
  created_at: string;
}

export interface PublicRole extends Omit<Role, 'detailed_description'> {}

export interface Drone {
  id: string;
  cube_id: string;
  role_id: string;
  label: string;
  last_seen: string;
  hostname: string | null;
  created_at: string;
  seen_since?: boolean;
}

export interface ActivityLogEntry {
  id: string;
  cube_id: string;
  drone_id: string;
  message: string;
  visibility: LogVisibility;
  created_at: string;
  recipient_drone_ids?: string[];
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
  drones: Drone[];
  roles: PublicRole[];
  message_taxonomy?: MessageTaxonomy | null;
  since?: string | null;
}

export interface ReadLogResponse {
  entries: ActivityLogEntry[];
  drones: Drone[];
  roles: PublicRole[];
  behind_by?: number;
  has_more?: boolean;
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
  unreachableRecipients?: Array<{ id: string; label: string }>;
}

export interface Decision {
  id: string;
  cube_id: string;
  topic: string;
  decision: string;
  rationale?: string | null;
  created_at: string;
  superseded_at?: string | null;
}

export interface RecordDecisionRequest {
  topic: string;
  decision: string;
  rationale?: string;
}

export interface RegenResponse {
  cube: Cube;
  role: Role;
  drone: Drone;
  roles: PublicRole[];
  drones: Drone[];
  recentLog?: ActivityLogEntry[];
  behind_by?: number;
}
