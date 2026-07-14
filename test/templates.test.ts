/**
 * Tests for cube template shipping (Sprint 14 / gh#TBD).
 *
 * Covers the `cube_directive` field added to the Template interface +
 * the no-clobber resolution helpers used by the `borg_create-cube` and
 * `borg_apply-template` handlers in index.ts.
 *
 * Design rationale: handlers in index.ts call `resolveCubeDirectiveForCreate`
 * (at cube-creation time) and `resolveCubeDirectiveForApply` (at
 * post-apply time) to decide whether the template's cube_directive text
 * should land on the cube. Pure-function extraction lets us unit-test
 * the discipline-port logic without mocking the full MCP-tool dispatch
 * stack + remote-client HTTP layer.
 */
import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplate,
  resolveCubeDirectiveForCreate,
  resolveCubeDirectiveForApply,
  resolveMessageTaxonomyForCreate,
  type Template,
} from '../src/templates.js';

describe('Sprint 14: Template.cube_directive field', () => {
  it('software-dev template ships with cube_directive populated', () => {
    const t = getTemplate('software-dev');
    expect(t).not.toBeNull();
    expect(typeof t!.cube_directive).toBe('string');
    expect(t!.cube_directive!.length).toBeGreaterThan(100);
  });

  it('software-dev cube_directive names all three Coordinator dispatch principles', () => {
    const t = getTemplate('software-dev');
    expect(t!.cube_directive).toContain('reachable');
    expect(t!.cube_directive).toContain('Verify before claiming');
    expect(t!.cube_directive).toContain('Structure');
  });

  it('software-dev cube_directive strips borg-mcp-specific origin citations (generic shape)', () => {
    // Per Sprint 14 dispatch: "Strip borg-mcp-specific origin citations.
    // Keep the principle text + checklist generic for any cube."
    const t = getTemplate('software-dev');
    const text = t!.cube_directive!;
    // No timestamped cube entries
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // No gh# issue references
    expect(text).not.toMatch(/gh#\d+/);
    // No Sprint-N origin attribution
    expect(text).not.toMatch(/Sprint \d+/);
    // No entry-id UUIDs
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it('software-dev cube_directive includes the pre-borg_log checklist', () => {
    const t = getTemplate('software-dev');
    expect(t!.cube_directive).toContain('checklist');
  });

  it('Code Reviewer role text guides claim-before-reviewing (gh#418)', () => {
    const t = getTemplate('software-dev');
    const cr = t!.roles.find((role) => role.name === 'Code Reviewer');
    expect(cr?.detailed_description).toContain('kind=claim');
    expect(cr?.detailed_description).toContain('claim it before reviewing');
    // skip a live peer's claim; re-claim a stale one
    expect(cr?.detailed_description).toContain('If a live peer already holds the claim');
    expect(cr?.detailed_description).toMatch(/re-claim and proceed/);
    // advisory invariant — merge stays keyed on REVIEW-APPROVED, never on a claim
    expect(cr?.detailed_description).toMatch(/merge eligibility stays keyed on .?REVIEW-APPROVED.?, NEVER on a claim/);
  });

  it('Coordinator role text drops manual pre-assign as primary → reviewers self-claim (gh#418)', () => {
    const t = getTemplate('software-dev');
    const coord = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coord?.detailed_description).toContain("don't pre-assign a canonical reviewer per branch");
    expect(coord?.detailed_description).toContain('self-claim');
    // intervene only on unclaimed-past-SLA or stale-claim
    expect(coord?.detailed_description).toContain('unclaimed past the SLA');
    expect(coord?.detailed_description).toMatch(/claim has gone stale/);
  });

  it('Coordinator role-text frames borg_decide as the ratification act (gh#740)', () => {
    const t = getTemplate('software-dev');
    const coord = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coord?.detailed_description).toContain('borg_decide');
    expect(coord?.detailed_description).toMatch(/recording IS the ratification act/);
    expect(coord?.detailed_description).toContain('NOT ratified until it is in the registry');
    expect(coord?.detailed_description).toContain('borg_decisions');
  });

  it('Coordinator role includes rename rollout compatibility guidance', () => {
    const t = getTemplate('software-dev');
    const coordinator = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coordinator?.detailed_description).toContain(
      'Schema/API rename + wire-shape rollout checklist'
    );
    expect(coordinator?.detailed_description).toContain(
      'Input compatibility is only half the gate'
    );
    expect(coordinator?.detailed_description).toContain(
      'Published client behavior is not live until users or agents restart/adopt it'
    );
  });

  it('Coordinator autonomous-mode guidance includes idleness detection', () => {
    const t = getTemplate('software-dev');
    const coordinator = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coordinator?.detailed_description).toContain(
      '## Keeping the pipeline fed (idleness-detection)'
    );
    expect(coordinator?.detailed_description).toContain(
      'Use an idleness-detector: a short ScheduleWakeup heartbeat'
    );
    expect(coordinator?.detailed_description).toContain(
      'Trigger = the idle condition, not the clock'
    );
    expect(coordinator?.detailed_description).toContain(
      '~15 min ± 3 min jitter'
    );
  });

  it('Coordinator role includes disposition-thrash guard guidance', () => {
    const t = getTemplate('software-dev');
    const coordinator = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coordinator?.detailed_description).toContain(
      'Disposition-thrash guard'
    );
    expect(coordinator?.detailed_description).toContain(
      'once SR / CR / PS / PD / RQ posts `STARTING` on that concern'
    );
    expect(coordinator?.detailed_description).toContain(
      'Key on the observable `STARTING` review signal'
    );
    expect(coordinator?.detailed_description).toContain(
      'choose the zero-action outcome'
    );
    expect(coordinator?.detailed_description).toContain(
      'Crossed in-flight Builder pushes are no-fault timing collisions'
    );
  });

  it('Builder role includes worktree-discipline guidance', () => {
    const t = getTemplate('software-dev');
    const builder = t!.roles.find((role) => role.name === 'Builder');
    expect(builder?.detailed_description).toContain('Worktree discipline');
    expect(builder?.detailed_description).toContain('create and use the feature branch in your assigned worktree');
    expect(builder?.detailed_description).toContain('Operate via your cwd / relative paths');
    expect(builder?.detailed_description).toContain('NEVER operate on a shared primary checkout');
    expect(builder?.detailed_description).toContain('work created there may not reach your assigned branch without manual surgery');
    expect(builder?.detailed_description).toContain('The Coordinator must not share an implementation checkout');
  });

  it('Coordinator release cycle includes the issue-close-out step', () => {
    const t = getTemplate('software-dev');
    const coordinator = t!.roles.find((role) => role.name === 'Coordinator');
    expect(coordinator?.detailed_description).toContain(
      'Full release cycle (6 steps for code-bearing PRs)'
    );
    expect(coordinator?.detailed_description).toContain(
      'Close resolved issue(s)'
    );
    expect(coordinator?.detailed_description).toContain(
      "use the repository host's merge-time issue-closing mechanism"
    );
  });

  it('software-dev marks reviewer/event roles broadcast-capable for strict gating', () => {
    const t = getTemplate('software-dev')!;
    const byName = new Map(t.roles.map((role) => [role.name, role]));
    for (const name of [
      'Coordinator',
      'Code Reviewer',
      'Release Quality',
      'Product Design',
      'Product Strategy',
      'Security Auditor',
    ]) {
      expect(byName.get(name)?.can_broadcast, name).toBe(true);
    }
    expect(byName.get('Builder')?.can_broadcast).not.toBe(true);
  });

  it('ships only the consolidated software-development roles', () => {
    const roleNames = getTemplate('software-dev')!.roles.map((role) => role.name);
    expect(roleNames).toEqual([
      'Coordinator',
      'Builder',
      'Code Reviewer',
      'Release Quality',
      'Product Design',
      'Product Strategy',
      'Security Auditor',
    ]);
    for (const retired of [
      'QA Tester',
      'Documentation Expert',
      'UX Expert',
      'UI Designer',
      'Product Manager',
      'Visionary',
    ]) {
      expect(roleNames).not.toContain(retired);
    }
  });

  it('keeps the public template free of private-project implementation lore', () => {
    const text = JSON.stringify(getTemplate('software-dev'));
    for (const forbidden of [
      /gh#\d+/i,
      /Sprint \d+/i,
      /Refinement #\d+/i,
      /CLAUDE\.md/i,
      /origin\/main/i,
      /Cloudflare/i,
      /Neon/i,
      /Stripe/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it('does not contradict one-signal or unread-log safety disciplines', () => {
    const text = JSON.stringify(getTemplate('software-dev'));
    expect(text).not.toContain('Bundle related posts into single entries');
    expect(text).not.toContain('specific since-timestamp or entry-id rather than wide windows');
  });

  it('starter marks Coordinator and Reviewer broadcast-capable but leaves Worker direct-first', () => {
    const t = getTemplate('starter')!;
    const byName = new Map(t.roles.map((role) => [role.name, role]));
    expect(byName.get('Coordinator')?.can_broadcast).toBe(true);
    expect(byName.get('Reviewer')?.can_broadcast).toBe(true);
    expect(byName.get('Worker')?.can_broadcast).not.toBe(true);
  });

  it('software-dev ships a default message taxonomy with directed status defaults', () => {
    const t = getTemplate('software-dev')!;
    const byClass = new Map(t.message_taxonomy?.map((entry) => [entry.class, entry]));
    expect(byClass.get('status-claim')).toMatchObject({
      routing: 'directed',
      default_to: ['coordinator', 'queen'],
    });
    expect(byClass.get('status-claim')?.prefixes).toContain('STARTING');
    // gh#16: REVIEW-READY is now directed to the Coordinator + every reviewer role (decision B).
    expect(byClass.get('review-request')).toMatchObject({ routing: 'directed' });
    expect(byClass.get('review-request')?.prefixes).toContain('REVIEW-READY');
    expect(byClass.get('review-request')?.default_to).toEqual([
      'coordinator',
      'queen',
      'code-reviewer',
      'security-auditor',
      'release-quality',
      'product-design',
    ]);
    // gh#16: only DECISION / HALT stay genuinely cube-wide.
    expect(byClass.get('cube-wide')).toMatchObject({ routing: 'broadcast' });
    expect(byClass.get('cube-wide')?.prefixes).toEqual(['DECISION', 'HALT']);
    // gh#16: merge state is directed to the Coordinator, not a cube-wide wake.
    expect(byClass.get('merge-status')).toMatchObject({ routing: 'directed' });
    expect(byClass.get('merge-status')?.prefixes).toContain('MERGED');
    // The legacy broadcast 'gate-signal' / 'coordination' classes are gone.
    expect(byClass.has('gate-signal')).toBe(false);
    expect(byClass.has('coordination')).toBe(false);
  });

  it('keeps BLOCKED routed but not lifecycle-completing', () => {
    for (const name of ['software-dev', 'starter'] as const) {
      const taxonomy = getTemplate(name)!.message_taxonomy ?? [];
      const blockedClass = taxonomy.find((entry) => entry.prefixes?.includes('BLOCKED'));
      // gh#16: BLOCKED is directed to the Coordinator (was broadcast); still not a completion.
      expect(blockedClass, `${name} routes BLOCKED`).toMatchObject({ routing: 'directed' });
      expect(blockedClass?.lifecycle, `${name} BLOCKED leaves dispatch open`).toBeUndefined();
      expect(
        taxonomy.filter((entry) => entry.lifecycle === 'completion').flatMap((entry) => entry.prefixes ?? []),
        `${name} completion lifecycle prefixes`,
      ).not.toContain('BLOCKED');
    }
  });

  it('starter ships a generic default message taxonomy', () => {
    const t = getTemplate('starter')!;
    const status = t.message_taxonomy?.find((entry) => entry.class === 'status-claim');
    expect(status).toMatchObject({ routing: 'directed', default_to: ['coordinator', 'queen'] });
    expect(status?.prefixes).toContain('STARTING');
  });

  it('gh#16 sweep: every taxonomy class except cube-wide is directed (regression guard)', () => {
    for (const name of ['software-dev', 'starter'] as const) {
      const taxonomy = getTemplate(name)!.message_taxonomy ?? [];
      // exactly one broadcast class — cube-wide (DECISION/HALT) — exists.
      expect(
        taxonomy.some((entry) => entry.class === 'cube-wide'),
        `${name} has a cube-wide class`,
      ).toBe(true);
      for (const entry of taxonomy) {
        if (entry.class === 'cube-wide') {
          expect(entry.routing, `${name} cube-wide stays broadcast`).toBe('broadcast');
        } else {
          // a class silently regressing to broadcast would reopen the gh#16 fan-out.
          expect(entry.routing, `${name} ${entry.class} stays directed`).toBe('directed');
          expect(
            entry.default_to?.length,
            `${name} ${entry.class} keeps a non-empty default_to`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('Builder and Worker role text describes class-based smart defaults', () => {
    const builder = getTemplate('software-dev')!.roles.find((role) => role.name === 'Builder');
    const worker = getTemplate('starter')!.roles.find((role) => role.name === 'Worker');
    expect(builder?.detailed_description).toContain('Message-class routing defaults');
    expect(builder?.detailed_description).toContain('class-based smart defaults');
    expect(builder?.detailed_description).not.toContain('strict broadcast-gating');
    expect(worker?.detailed_description).toContain('Message-class routing defaults');
    expect(worker?.detailed_description).not.toContain('strict broadcast-gating');
  });
});

describe('Sprint 14: resolveCubeDirectiveForCreate', () => {
  const templateWithCubeDirective: Template = {
    name: 'test-template',
    description: 'test',
    roles: [],
    cube_directive: 'template-supplied directive text',
  };
  const templateWithoutCubeDirective: Template = {
    name: 'test-template-bare',
    description: 'test',
    roles: [],
  };

  it('uses operator-supplied cube_directive when non-empty (operator priority)', () => {
    const result = resolveCubeDirectiveForCreate('operator text', templateWithCubeDirective);
    expect(result).toBe('operator text');
  });

  it('falls back to template cube_directive when operator passes empty string', () => {
    const result = resolveCubeDirectiveForCreate('', templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('falls back to template cube_directive when operator passes only whitespace', () => {
    const result = resolveCubeDirectiveForCreate('   \n  ', templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('returns empty string when both operator empty AND template has no cube_directive', () => {
    const result = resolveCubeDirectiveForCreate('', templateWithoutCubeDirective);
    expect(result).toBe('');
  });

  it('returns empty string when both operator empty AND template is null (no template specified)', () => {
    const result = resolveCubeDirectiveForCreate('', null);
    expect(result).toBe('');
  });

  it('preserves operator-supplied cube_directive even when template has its own (no-overwrite)', () => {
    // Operator-customized directives MUST NOT be overridden by template defaults.
    const result = resolveCubeDirectiveForCreate('operator custom text', templateWithCubeDirective);
    expect(result).toBe('operator custom text');
    expect(result).not.toBe('template-supplied directive text');
  });
});

describe('Sprint 14: resolveCubeDirectiveForApply', () => {
  const templateWithCubeDirective: Template = {
    name: 'test-template',
    description: 'test',
    roles: [],
    cube_directive: 'template-supplied directive text',
  };
  const templateWithoutCubeDirective: Template = {
    name: 'test-template-bare',
    description: 'test',
    roles: [],
  };

  it('returns template cube_directive when cube has empty current cube_directive', () => {
    const result = resolveCubeDirectiveForApply('', templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('returns template cube_directive when current cube directive is null', () => {
    const result = resolveCubeDirectiveForApply(null, templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('returns template cube_directive when current cube directive is undefined', () => {
    const result = resolveCubeDirectiveForApply(undefined, templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('returns template cube_directive when current cube directive is only whitespace', () => {
    const result = resolveCubeDirectiveForApply('   \n\t  ', templateWithCubeDirective);
    expect(result).toBe('template-supplied directive text');
  });

  it('returns null when cube already has non-empty cube_directive (no-clobber)', () => {
    // Operator-customized directives MUST NOT be overridden by template apply.
    const result = resolveCubeDirectiveForApply(
      'existing operator-customized rules',
      templateWithCubeDirective,
    );
    expect(result).toBeNull();
  });

  it('returns null when template has no cube_directive (nothing to apply)', () => {
    const result = resolveCubeDirectiveForApply('', templateWithoutCubeDirective);
    expect(result).toBeNull();
  });

  it('returns null when both cube has rules AND template has none (no-op)', () => {
    const result = resolveCubeDirectiveForApply(
      'existing rules',
      templateWithoutCubeDirective,
    );
    expect(result).toBeNull();
  });
});

describe('Sprint 14: TEMPLATES registry', () => {
  it('exposes the new cube_directive field on the registered software-dev template', () => {
    const sw = TEMPLATES['software-dev'];
    expect(sw).toBeDefined();
    expect(typeof sw.cube_directive).toBe('string');
  });
});

describe('gh#468: resolveMessageTaxonomyForCreate', () => {
  const taxonomy = [
    {
      class: 'status-claim',
      prefixes: ['STARTING'],
      routing: 'directed' as const,
      default_to: ['coordinator'],
    },
  ];
  const templateWithTaxonomy: Template = {
    name: 'test-template',
    description: 'test',
    roles: [],
    message_taxonomy: taxonomy,
  };

  it('uses operator-supplied taxonomy when present', () => {
    const operatorTaxonomy = [{ class: 'custom', routing: 'broadcast' as const }];
    expect(resolveMessageTaxonomyForCreate(operatorTaxonomy, templateWithTaxonomy)).toBe(
      operatorTaxonomy
    );
  });

  it('falls back to template taxonomy when operator omits it', () => {
    expect(resolveMessageTaxonomyForCreate(undefined, templateWithTaxonomy)).toBe(taxonomy);
  });

  it('preserves explicit null as no taxonomy', () => {
    expect(resolveMessageTaxonomyForCreate(null, templateWithTaxonomy)).toBeNull();
  });
});

// gh#473 PR2: resolveMessageTaxonomyForApply (formerly gh#468) was removed
// as orphaned — non-clobbering taxonomy merge now lives server-side in
// CubeStore.syncRolesNonClobber. No client production caller remained.
