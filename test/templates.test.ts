import { describe, expect, it } from 'vitest';
import {
  ANTI_PASSIVE_STANDING_DISCIPLINE,
  LEGACY_DEFAULT_TEMPLATE_LABEL,
  NEW_CUBE_TEMPLATE_PRESENTATIONS,
  TEMPLATES,
  getTemplate,
  listTemplateNames,
  resolveCubeDirectiveForApply,
  resolveCubeDirectiveForCreate,
  resolveMessageTaxonomyForCreate,
  type Template,
} from '../src/templates.js';
import * as generatedTemplates from '../dist/templates.js';

const CONCISE_ROLE_BUDGET = 12_000;
const COORDINATOR_ROLE_LIMIT = 45_000;
const ROLE_LIMIT = 51_200;

const COORDINATOR_ACTIVATION_COPY = [
  'START NOW, RESUME NOW, REVIEW NOW, or HOLD',
  'ACK and claim are receipt only',
  'STARTING or substantive PROGRESS within 2 minutes',
  'Directly kick a miss',
  'After 5 more minutes without substantive response, probe liveness',
  'reassign only when eligible and authorized',
  'substantive PROGRESS at least every 10 minutes',
  'Require immediate BLOCKED',
];

describe('cube templates', () => {
  it('registers the built-in templates', () => {
    expect(listTemplateNames()).toEqual(['software-dev', 'starter', 'local-model']);
    expect(getTemplate('missing')).toBeNull();
  });

  it('owns the exact host-neutral template presentation copy', () => {
    expect(LEGACY_DEFAULT_TEMPLATE_LABEL).toBe('Default (legacy)');
    expect(NEW_CUBE_TEMPLATE_PRESENTATIONS).toEqual([
      {
        name: 'software-dev',
        label: 'Software Development',
        short_description: 'Recommended for code repositories.',
      },
      {
        name: 'starter',
        label: 'Starter',
        short_description: 'Minimal roles for general projects.',
      },
      {
        name: 'local-model',
        label: 'Local Model',
        short_description: 'Maximizes local-model execution through complete, machine-checkable work packets.',
      },
    ]);
    expect(NEW_CUBE_TEMPLATE_PRESENTATIONS.map(({ name }) => name)).not.toContain('default');
    expect(TEMPLATES['software-dev']).toMatchObject({
      label: 'Software Development',
      short_description: 'Recommended for code repositories.',
    });
    expect(TEMPLATES.starter).toMatchObject({
      label: 'Starter',
      short_description: 'Minimal roles for general projects.',
    });
    expect(TEMPLATES['local-model']).toMatchObject({
      label: 'Local Model',
      short_description: 'Maximizes local-model execution through complete, machine-checkable work packets.',
    });
    expect(NEW_CUBE_TEMPLATE_PRESENTATIONS).toEqual(
      listTemplateNames().map((name) => {
        const { label, short_description } = TEMPLATES[name];
        return { name, label, short_description };
      }),
    );
  });

  it('keeps a separate platform Queen role out of use-case templates', () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.roles.map((role) => role.name)).not.toContain('Queen');
      expect(JSON.stringify(template.roles)).not.toContain('role_class');
    }
  });

  it('ships the expected software-development roles', () => {
    expect(TEMPLATES['software-dev'].roles.map((role) => role.name)).toEqual([
      'Coordinator',
      'Builder',
      'Code Reviewer',
      'Release Quality',
      'Product Design',
      'Product Strategy',
      'Security Auditor',
    ]);
  });

  it('ships the expected generic starter roles', () => {
    expect(TEMPLATES.starter.roles.map((role) => role.name)).toEqual([
      'Coordinator',
      'Worker',
      'Reviewer',
    ]);
  });

  it('ships the adopted local-model roles and no rejected tier names', () => {
    const template = TEMPLATES['local-model'];
    expect(template.roles.map((role) => role.name)).toEqual([
      'Director',
      'Shaper',
      'Executor',
    ]);
    expect(template.roles.find((role) => role.name === 'Director')).toMatchObject({
      is_mandatory: true,
      is_human_seat: true,
      can_broadcast: true,
    });
    expect(template.roles.find((role) => role.name === 'Executor')).toMatchObject({
      is_default: true,
    });
    expect(JSON.stringify(template)).not.toMatch(/\b(?:Jarl|Karl|Thrall)\b/);
  });

  it('makes every local-model role purpose self-contained', () => {
    const roles = Object.fromEntries(
      TEMPLATES['local-model'].roles.map((role) => [role.name, role.short_description]),
    );
    expect(roles).toEqual({
      Director: 'Owns intent, authorization, and careful-reading verification; never implements changes.',
      Shaper: 'Converts intent into complete machine-checkable packets, runs acceptance checks, and implements only unconvertible work.',
      Executor: 'Executes one complete packet exactly, refuses missing literals, and returns only a diff plus verbatim check output.',
    });
  });

  it('makes the five-field conversion contract and anti-gaming guards literal', () => {
    const template = TEMPLATES['local-model'];
    const shaper = template.roles.find((role) => role.name === 'Shaper')!.detailed_description;
    const executor = template.roles.find((role) => role.name === 'Executor')!.detailed_description;

    for (const field of ['Surface', 'Shape', 'Check', 'Forbidden to infer', 'Echo schema']) {
      expect(shaper).toContain(`${field}:`);
      expect(executor).toContain(field);
    }
    for (const guard of [
      'withhold at least one holdout test',
      'Test files must stay outside Surface',
      'Deleting or weakening an assertion is automatic rejection',
      'Never regenerate a golden file',
    ]) {
      expect(`${shaper}\n${executor}`).toContain(guard);
    }
    expect(shaper).toContain('Run every packet check yourself');
    expect(shaper).toContain('Do not accept copied output as proof');
  });

  it('keeps Executor communication to echo, refusal, and evidence completion', () => {
    const taxonomy = TEMPLATES['local-model'].message_taxonomy!;
    expect(taxonomy.filter((entry) => entry.class.startsWith('executor-'))).toEqual([
      {
        class: 'executor-echo',
        prefixes: ['PACKET-ECHO'],
        routing: 'directed',
        default_to: ['shaper'],
      },
      {
        class: 'executor-refusal',
        prefixes: ['SPEC-GAP'],
        routing: 'directed',
        default_to: ['shaper'],
      },
      {
        class: 'executor-completion',
        prefixes: ['PACKET-DONE'],
        routing: 'directed',
        default_to: ['shaper'],
        lifecycle: 'completion',
      },
    ]);
  });

  it('does not let local-model roles end a turn while assigned work remains', () => {
    const template = TEMPLATES['local-model'];
    const director = template.roles.find((role) => role.name === 'Director')!.detailed_description;
    const shaper = template.roles.find((role) => role.name === 'Shaper')!.detailed_description;
    const executor = template.roles.find((role) => role.name === 'Executor')!.detailed_description;

    expect(director).toContain('Never implement');
    expect(shaper).toContain('A Shaper assignment ends only with BLOCKED or REVIEW-READY');
    expect(executor).toContain('An active packet ends only with SPEC-GAP or PACKET-DONE');
    expect(executor).toContain('PACKET-ECHO is not completion');
    expect(executor.indexOf('resume the packet in the same turn')).toBeLessThan(
      executor.indexOf('Waiting is valid only when no packet is active'),
    );
  });

  it('makes scope and authority explicit in every role', () => {
    for (const [templateName, template] of Object.entries(TEMPLATES)) {
      for (const role of template.roles) {
        const text = role.detailed_description.toLowerCase();
        expect(
          text.includes('authorized') || text.includes('explicitly dispatched') || text.includes('routed'),
          `${templateName}/${role.name} states its authority`,
        ).toBe(true);
        expect(text, `${templateName}/${role.name} has a scope boundary`).toMatch(
          /scope|boundar|stated slice|requested outcome|current work/,
        );
      }
    }
  });

  it('makes waiting valid instead of manufacturing work', () => {
    expect(ANTI_PASSIVE_STANDING_DISCIPLINE).toContain('Waiting is correct');
    for (const template of Object.values(TEMPLATES)) {
      expect(template.cube_directive).toMatch(/Waiting is valid/i);
      const coordinatingRole = template.roles.find((role) => role.is_human_seat);
      expect(coordinatingRole?.detailed_description).toMatch(/Waiting is valid/i);
    }
  });

  it('removes playbook-expansion and autonomous-work anti-patterns', () => {
    const text = JSON.stringify(TEMPLATES);
    for (const forbidden of [
      /Queen seat DOES NOT STAND/i,
      /Standing.*BANNED/i,
      /hold capacity is wasted capacity/i,
      /cube idle = take action/i,
      /never passively wait/i,
      /pull from the open-issues queue/i,
      /periodic full-codebase sweeps/i,
      /file a durable follow-up issue/i,
      /git reset --hard/i,
      /force-tag-push/i,
      /ship-on-consensus/i,
      /Queen-Direct-Authorized/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it('keeps role bodies concise', () => {
    for (const [templateName, template] of Object.entries(TEMPLATES)) {
      for (const role of template.roles) {
        expect(role.detailed_description.length, `${templateName}/${role.name} hard limit`)
          .toBeLessThanOrEqual(ROLE_LIMIT);
        expect(role.detailed_description.length, `${templateName}/${role.name} concise budget`)
          .toBeLessThanOrEqual(CONCISE_ROLE_BUDGET);
      }
    }

    const coordinator = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Coordinator')!;
    expect(coordinator.detailed_description.length, 'software-dev/Coordinator target')
      .toBeLessThanOrEqual(COORDINATOR_ROLE_LIMIT);
  });

  it('binds Coordinator activation without granting scope', () => {
    const coordinator = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Coordinator')!;
    for (const phrase of COORDINATOR_ACTIVATION_COPY) {
      expect(coordinator.detailed_description).toContain(phrase);
    }
    expect(coordinator.detailed_description).toContain('does not authorize');
    expect(coordinator.detailed_description).toContain('Never manufacture work');
  });

  it('gives Builders an ordered minimum-sufficient-change discipline', () => {
    const builder = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Builder')!;
    const text = builder.detailed_description;
    const ladder = [
      'no change when the requirement is already satisfied',
      'an existing repository helper or pattern',
      'the standard library or native platform',
      'an already-installed dependency',
      'only then the minimum new code',
    ];

    expect(text).toContain('Read and trace the real affected flow before choosing an implementation.');
    expect(text).toContain(
      'Make the smallest change that satisfies the complete authorized acceptance criteria.',
    );
    expect(text).toContain('fully works, not the least work');
    expect(text).toContain(
      'fix the root cause at the narrowest shared point when that is safer and smaller than per-caller patches',
    );
    const positions = ladder.map((phrase) => text.indexOf(phrase));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it('keeps Builder safety and testing boundaries stronger than minimum-change pressure', () => {
    const builder = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Builder')!;
    const text = builder.detailed_description;
    for (const boundary of [
      'trust-boundary validation',
      'security controls',
      'data-loss prevention',
      'accessibility requirements',
      'explicit acceptance criteria',
      'proportionate regression tests',
      'Add proportionate tests for behavior you change',
      'If the request is ambiguous in a way that changes scope, post BLOCKED',
      'Do not add cleanup, broad refactors, speculative hardening',
      'Do not review, merge, deploy, publish, tag, release, or mutate live systems',
    ]) {
      expect(text).toContain(boundary);
    }
    expect(text).not.toMatch(/persistent mode|intensity level|persona|deliberately reduced version|GitHub/i);
  });

  it('keeps review routing serialized through the coordinating seat', () => {
    for (const [templateName, template] of Object.entries(TEMPLATES)) {
      const review = template.message_taxonomy?.find((entry) => entry.class === 'review-request');
      expect(review).toMatchObject({
        routing: 'directed',
        default_to: templateName === 'local-model'
          ? ['director', 'queen']
          : ['coordinator', 'queen'],
      });
    }
  });

  it('keeps only decisions and halts cube-wide', () => {
    for (const [templateName, template] of Object.entries(TEMPLATES)) {
      for (const entry of template.message_taxonomy ?? []) {
        if (entry.class === 'cube-wide') {
          expect(entry.routing).toBe('broadcast');
          expect(entry.prefixes).toEqual(
            templateName === 'local-model' ? ['DECISION'] : ['DECISION', 'HALT'],
          );
        } else {
          expect(entry.routing, `${template.name}/${entry.class}`).toBe('directed');
          expect(entry.default_to?.length, `${template.name}/${entry.class}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('does not mark BLOCKED as lifecycle completion', () => {
    for (const template of Object.values(TEMPLATES)) {
      const blocked = template.message_taxonomy?.find((entry) => entry.prefixes?.includes('BLOCKED'));
      expect(blocked?.lifecycle).toBeUndefined();
    }
  });

  it('keeps source and generated template output identical', () => {
    expect(generatedTemplates.TEMPLATES).toEqual(TEMPLATES);
  });
});

describe('template no-clobber resolution', () => {
  const template: Template = {
    name: 'x',
    label: 'X',
    short_description: 'X template.',
    description: 'x',
    cube_directive: 'template directive',
    message_taxonomy: [{ class: 'status', routing: 'directed', default_to: ['coordinator'] }],
    roles: [],
  };

  it('uses operator cube text when supplied', () => {
    expect(resolveCubeDirectiveForCreate('operator directive', template)).toBe('operator directive');
  });

  it('fills a blank cube directive from the template', () => {
    expect(resolveCubeDirectiveForCreate('', template)).toBe('template directive');
    expect(resolveCubeDirectiveForCreate('   ', template)).toBe('template directive');
  });

  it('does not clobber an existing cube directive on apply', () => {
    expect(resolveCubeDirectiveForApply('existing', template)).toBeNull();
    expect(resolveCubeDirectiveForApply('', template)).toBe('template directive');
  });

  it('uses an explicit taxonomy and otherwise falls back to the template', () => {
    const explicit = [{ class: 'custom', routing: 'broadcast' as const }];
    expect(resolveMessageTaxonomyForCreate(explicit, template)).toBe(explicit);
    expect(resolveMessageTaxonomyForCreate(null, template)).toBeNull();
    expect(resolveMessageTaxonomyForCreate(undefined, template)).toEqual(template.message_taxonomy);
  });
});
