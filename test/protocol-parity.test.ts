import { describe, expect, it } from 'vitest';
import type {
  AppendLogResponse,
  AssimilateRequest,
  ReadLogResponse,
  RegenResponse,
  Role,
  RosterResponse,
  WhoAmIResponse,
} from '../src/protocol/index.js';

const role = {
  id: 'role-1',
  cube_id: 'cube-1',
  name: 'Builder',
  short_description: 'Builds changes.',
  detailed_description: 'Implement the assigned change.',
  is_default: true,
  is_mandatory: true,
  is_human_seat: false,
  can_broadcast: false,
  receives_all_direct: false,
  role_class: 'worker',
  created_at: '2026-01-01T00:00:00.000Z',
  detailed_description_hash: '0123456789abcdef',
} satisfies Role;

const drone = {
  id: 'drone-1',
  cube_id: 'cube-1',
  role_id: 'role-1',
  label: 'one-of-one-builder',
  is_queen_class: false,
  last_seen: '2026-01-01T00:00:00.000Z',
  last_log_post: null,
  hostname: 'host.example',
  last_regen_at: null,
  regen_count: '1',
  last_read_log_at: null,
  last_event_received_at: null,
  wake_path_client_sse_connected: true,
  wake_path_client_monitor_armed: true,
  wake_path_alert_class: 'independent',
  agent_kind: 'opencode',
  reported_model: null,
  working_repo_name: 'example',
  working_repo_origin: 'https://example.invalid/repository.git',
  runtime_metadata_reported: true,
  created_at: '2026-01-01T00:00:00.000Z',
} as const;

const { detailed_description: _description, detailed_description_hash: _hash, ...publicRoleBase } =
  role;
const publicRole = { ...publicRoleBase };

describe('current public response contracts', () => {
  it('represents implementation-neutral assimilation selectors', () => {
    const request = {
      cube_name: 'example',
      hostname: 'host.example',
      agent_kind: 'opencode',
    } satisfies AssimilateRequest;

    expect(request.cube_name).toBe('example');
    expect(request.agent_kind).toBe('opencode');
  });

  it('represents roster role, repository, model, and wake-path fields', () => {
    const response = {
      drones: [
        {
          ...drone,
          behind_by: 0,
          wake_path: 'live',
          wake_path_deaf_streak: 0,
          wake_path_last_challenge_at: null,
          wake_path_last_alert_at: null,
        },
      ],
      roles: [publicRole],
      message_taxonomy: null,
      since: null,
    } satisfies RosterResponse;

    expect(response.drones[0].working_repo_name).toBe('example');
    expect(response.drones[0].wake_path).toBe('live');
    expect(response.roles[0].is_mandatory).toBe(true);
  });

  it('represents read-log claims and nullable entry attribution', () => {
    const response = {
      entries: [
        {
          id: 'entry-1',
          cube_id: 'cube-1',
          drone_id: null,
          message: 'System message',
          visibility: 'broadcast',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      drones: [drone],
      roles: [publicRole],
      behind_by: 1,
      has_more: false,
      claims: [
        {
          log_entry_id: 'entry-1',
          claimant_drone_id: 'drone-1',
          claimant_label: 'one-of-one-builder',
          claimant_role: 'Builder',
          claimed_at: '2026-01-01T00:00:00.000Z',
          stale: false,
        },
      ],
    } satisfies ReadLogResponse;

    expect(response.claims).toHaveLength(1);
  });

  it('represents orientation hashes, decisions, and identity metadata', () => {
    const response = {
      cube: {
        id: 'cube-1',
        owner_id: 'owner-1',
        name: 'example',
        cube_directive: '',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        directive_hash: '0123456789abcdef',
      },
      role,
      drone,
      roles: [publicRole],
      drones: [drone],
      decisions: [
        {
          id: 'decision-1',
          cube_id: 'cube-1',
          topic: 'example',
          decision: 'Use the shared contract.',
          rationale: null,
          ratified_by: 'drone-1',
          status: 'active',
          supersedes: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      behind_by: 0,
    } satisfies RegenResponse;

    expect(response.cube.directive_hash).toHaveLength(16);
    expect(response.role.detailed_description_hash).toHaveLength(16);
  });

  it('returns canonical current metadata from the own identity surface', () => {
    const response = {
      cube_id: 'cube-1',
      cube_name: 'example',
      drone_id: 'drone-1',
      drone_label: 'one-of-one-builder',
      role_id: 'role-1',
      role_name: 'Builder',
      runtime_metadata: {
        agent_kind: 'opencode',
        reported_model: null,
        working_repo_name: 'owner/repo',
        working_repo_origin: 'https://github.com/owner/repo',
      },
      runtime_metadata_reported: true,
    } satisfies WhoAmIResponse;

    expect(response.runtime_metadata.agent_kind).toBe('opencode');
  });

  it('keeps append routing metadata separate from the activity entry', () => {
    const response = {
      entry: {
        id: 'entry-1',
        cube_id: 'cube-1',
        drone_id: 'drone-1',
        message: 'REVIEW-READY: example',
        visibility: 'direct',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      routing: {
        class: 'review',
        recipients: ['one-of-one-reviewer'],
        fellOpen: false,
        message: 'Routing applied.',
      },
      unreachableRecipients: [],
    } satisfies AppendLogResponse;

    expect(response.entry).not.toHaveProperty('recipient_drone_ids');
  });
});
