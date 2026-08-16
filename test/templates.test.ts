import { describe, expect, it } from 'vitest';
import {
  ANTI_PASSIVE_STANDING_DISCIPLINE,
  COORDINATOR_FINDING_DISPATCH_DISCIPLINE,
  LEGACY_DEFAULT_TEMPLATE_LABEL,
  NEW_CUBE_TEMPLATE_PRESENTATIONS,
  REVIEWER_FINDING_DISCIPLINE,
  SAME_REPOSITORY_WORKFLOW_DISCIPLINE,
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
  'concrete milestones from the dispatch and acceptance evidence',
  'one direct status request',
  'report the evidence to the human',
  'requires explicit human operator approval for the exact work item and recipient',
  'Require BLOCKED when safe work stops',
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
      Shaper: 'Converts intent into complete machine-checkable packets, runs acceptance checks, and implements only with explicit Director authorization.',
      Executor: 'Executes one complete packet exactly, refuses missing literals, and returns an exact commit SHA plus verbatim check output.',
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

    const executor = TEMPLATES['local-model'].roles.find((role) => role.name === 'Executor')!
      .detailed_description;
    expect(executor).toContain('Send SPEC-GAP and PACKET-DONE to the Shaper');
    expect(executor).toContain('Receive EXECUTE PACKET, ACCEPT, and REJECT from the Shaper');
    expect(executor).toContain('The Shaper shapes packets and accepts or rejects returned commits');
    expect(executor).toContain('The Director owns decisions and independently verifies accepted work');
    expect(executor).toContain('exact commit SHA');
    expect(executor).not.toContain('with the diff and verbatim check output');
  });

  it('gives the Shaper sole conversion ownership and a named implementation grantor', () => {
    const template = TEMPLATES['local-model'];
    const director = template.roles.find((role) => role.name === 'Director')!.detailed_description;
    const shaper = template.roles.find((role) => role.name === 'Shaper')!.detailed_description;

    expect(director).not.toContain('Decide what must be verified by a capable reader and what the Shaper may convert');
    expect(director).toContain('Own the outcome and its boundaries');
    expect(director).toContain('explicitly authorize Shaper implementation');
    expect(director).toContain('Receive BLOCKED from the Shaper');
    expect(director).toContain('Receive REVIEW-READY from the Shaper');
    expect(shaper).toContain('The Shaper alone decides whether all five fields have literal values');
    expect(shaper).toContain('Director sends a DISPATCH that explicitly authorizes Shaper implementation');
    expect(shaper).toContain('Receive DISPATCH, HOLD, and APPROVED from the Director');
    expect(shaper).toContain('Receive PACKET-ECHO, SPEC-GAP, and PACKET-DONE from the Executor');
  });

  it('does not let local-model roles end a turn while assigned work remains', () => {
    const template = TEMPLATES['local-model'];
    const director = template.roles.find((role) => role.name === 'Director')!.detailed_description;
    const shaper = template.roles.find((role) => role.name === 'Shaper')!.detailed_description;
    const executor = template.roles.find((role) => role.name === 'Executor')!.detailed_description;

    expect(director).toContain('Never implement');
    expect(director).toContain(
      'ends with APPROVED, or with BLOCKED naming the missing decision or the reason it cannot proceed',
    );
    expect(shaper).toContain('A Shaper assignment ends only with BLOCKED or REVIEW-READY');
    expect(executor).toContain('An active packet ends only with SPEC-GAP or PACKET-DONE');
    expect(executor).toContain('PACKET-ECHO is not completion');
    expect(executor).toContain(
      'A REJECT is not a packet. Take no action on it; wait for a new EXECUTE PACKET.',
    );
    expect(executor).toContain(
      'If asked anything you cannot answer with SPEC-GAP or PACKET-DONE, post SPEC-GAP naming what was asked.',
    );
    expect(executor.indexOf('Waiting is valid only when no packet is active')).toBeLessThan(
      executor.indexOf('resume the packet in the same turn'),
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
      /within 2 minutes/i,
      /After 5 more minutes/i,
      /every 10 minutes/i,
      /expected to finish within 10 minutes/i,
      /reassign only when eligible and authorized/i,
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

  it('requires operator approval before any coordinating role changes ownership', () => {
    const coordinatingRoles = [
      TEMPLATES['software-dev'].roles.find((role) => role.name === 'Coordinator')!,
      TEMPLATES.starter.roles.find((role) => role.name === 'Coordinator')!,
      TEMPLATES['local-model'].roles.find((role) => role.name === 'Director')!,
    ];

    for (const role of coordinatingRoles) {
      expect(role.detailed_description).toContain('one direct status request');
      expect(role.detailed_description).toContain('report the evidence to the human');
      expect(role.detailed_description).toContain(
        'requires explicit human operator approval for the exact work item and recipient',
      );
    }
  });

  it('back-ports only the ratified live-role operating improvements', () => {
    const roles = Object.fromEntries(
      TEMPLATES['software-dev'].roles.map((role) => [role.name, role.detailed_description]),
    );

    for (const phrase of [
      'Scope contract:',
      'whether the slice is independently integrable',
      'Drop an observation when it changes no decision',
      'Route one due gate at a time',
      'Never pre-route a later gate',
      'Require one proof per property',
      'Mechanical, version, lock, and generated changes require exact-revision CI plus one Code Review only',
      'Give a successor revision delta review',
      'Carry unchanged green evidence without rerunning it',
    ]) {
      expect(roles.Coordinator).toContain(phrase);
    }

    for (const phrase of [
      'Verify exact artifact identity and inspect the complete change before review',
      'generated-source consistency',
      'load-bearing behavior of a replaced implementation',
      'one consolidated, exhaustive REVIEW-APPROVED or REVIEW-FEEDBACK',
      'Do not repeat a finding on the same revision without new evidence',
      'withdraw the approval',
    ]) {
      expect(roles['Code Reviewer']).toContain(phrase);
    }

    for (const phrase of [
      'require the dispatch to state N/A explicitly',
      'smallest test matrix',
      'relevant success and failure paths',
      'compatibility, rollout order, and limitations',
      'environment and every relevant unverified boundary',
      'Do not represent a partial slice as the complete outcome',
    ]) {
      expect(roles['Release Quality']).toContain(phrase);
    }

    expect(roles['Product Design']).toContain('Inspect the actual implementation or artifact before making factual claims');
    expect(roles['Product Design']).toContain('loading, empty, success, error, destructive, and recovery states');
    expect(roles['Product Strategy']).toContain('one falsifiable recommendation');
    expect(roles['Product Strategy']).toContain('alternatives, risks, and measurable acceptance criteria');

    for (const phrase of [
      'If a predecessor gate is not applicable, require the dispatch to state N/A explicitly',
      'Non-security changes are N/A unless the dispatch names a concrete security invariant',
      'Severity does not create scope or remediation authority',
      'explicit target, repository boundary, time budget, and output expectation',
    ]) {
      expect(roles['Security Auditor']).toContain(phrase);
    }

    expect(TEMPLATES['software-dev'].cube_directive).toContain(
      'When an outcome includes a separately published external surface',
    );
    expect(TEMPLATES['software-dev'].cube_directive).toContain(
      'one owning role or seat for its implementation',
    );
  });

  it('gives Builders focused verification and proportionate reporting boundaries', () => {
    const builder = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Builder')!
      .detailed_description;

    for (const phrase of [
      'Post PROGRESS only when a substantive milestone changes what the Coordinator needs to know',
      'Do not interrupt slow local work merely to satisfy a reporting cadence',
      'Run focused verification required by the touched surface',
      'do not rerun green CI checks merely to duplicate exact-revision evidence',
      'Check documentation or a separately published site only when the changed behavior, public API, package metadata, or named user claim belongs to that surface',
    ]) {
      expect(builder).toContain(phrase);
    }
  });

  it('uses automatic tag staging with one human publication boundary', () => {
    const directive = TEMPLATES['software-dev'].cube_directive!;

    expect(directive).toContain(
      'A release tag starts the tag-restricted staging workflow automatically',
    );
    expect(directive).toContain('npm stage approval is the sole human publication boundary');
    expect(directive).toContain(
      'Before npm accepts a stage, correct a failed workflow and retry the same immutable tag',
    );
    expect(directive).toContain('Never move, replace, or force-update the tag');
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
    expect(text).toContain('BUILD WHAT WAS ROUTED, NOT ITS GENERAL CASE');
    expect(text).toContain('already satisfies the slice');
    expect(text).toContain('complete answer');
    expect(text).toContain('known ceiling');
    expect(text).toContain('upgrade path');
  });

  it('puts producer minimalism at Shaper conversion and Executor refusal boundaries', () => {
    const template = TEMPLATES['local-model'];
    const shaper = template.roles.find((role) => role.name === 'Shaper')!.detailed_description;
    const executor = template.roles.find((role) => role.name === 'Executor')!.detailed_description;
    const ladder = [
      'the repository already satisfies the outcome',
      'an existing helper or pattern',
      'the standard library or native platform',
      'an already-installed dependency',
      'only then specify the minimum new code',
    ];
    const positions = ladder.map((phrase) => shaper.indexOf(phrase));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(shaper).toContain('inspect sibling callers');
    expect(shaper).toContain('narrowest shared cause');
    expect(shaper).toContain('symptom patches');
    expect(executor).toContain('Do not add an abstraction, helper, wrapper, or file the packet did not specify');
    expect(executor).toContain('If Shape permits fewer lines, use fewer lines');
    expect(executor).toContain('Prefer deletion over addition where the packet permits both');
    expect(executor).toContain('that is a SPEC-GAP');
  });

  it('gives Product Strategy a bounded removal-first simplification sweep', () => {
    const strategy = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Product Strategy')!
      .detailed_description;
    for (const phrase of [
      'Simplification sweep:',
      'scope the Coordinator names',
      'what carrying it costs and what removing it costs',
      'Propose deletion first',
      'Never propose new machinery to manage complexity',
      '"Leave it" is a legitimate conclusion',
    ]) {
      expect(strategy).toContain(phrase);
    }
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
            templateName === 'local-model'
              ? ['DECISION']
              : templateName === 'software-dev'
                ? ['DECISION', 'HALT', 'MERGED']
                : ['DECISION', 'HALT'],
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

  it('ships only same-repository workflow policy at cube level', () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.cube_directive).toContain(SAME_REPOSITORY_WORKFLOW_DISCIPLINE);
    }

    for (const phrase of [
      'git checkout -b <branch>',
      'One branch equals one work item and one owning seat',
      'Announce its name in STARTING',
      'merge-only history',
      'one exact SHA',
      'git remote get-url origin',
      'git push -u origin <branch>',
      'REVIEW-READY only after that push',
      'When that command fails because no origin exists',
      'exact commit SHA is available through the project review mechanism',
      'broadcast the merge SHA',
    ]) {
      expect(SAME_REPOSITORY_WORKFLOW_DISCIPLINE).toContain(phrase);
    }
    for (const mechanism of [
      'sharing its object database and refs',
      'git checkout --detach <SHA>',
      'local bare repository',
      '~/.borg/scratch/',
      'commit itself is the durable handover artifact',
    ]) {
      expect(SAME_REPOSITORY_WORKFLOW_DISCIPLINE).not.toContain(mechanism);
    }
  });

  it('aligns every role message with structured routing and taxonomy', () => {
    type ExpectedRoute = { signals: string[]; recipient: string };
    const worksheet: Record<string, Record<string, ExpectedRoute[]>> = {
      'software-dev': {
        Coordinator: [
          { signals: ['START NOW', 'RESUME NOW', 'REVIEW NOW', 'HOLD', 'PING'], recipient: 'named implementer or reviewer' },
          { signals: ['DECISION', 'HALT', 'MERGED'], recipient: 'cube-wide' },
        ],
        Builder: [{ signals: ['STARTING', 'PROGRESS', 'PUSHING', 'DONE', 'REVIEW-READY', 'BLOCKED'], recipient: 'Coordinator' }],
        'Code Reviewer': [{ signals: ['REVIEW-APPROVED', 'REVIEW-FEEDBACK', 'BLOCKED'], recipient: 'Coordinator' }],
        'Release Quality': [{ signals: ['RQ-APPROVED', 'RQ-FEEDBACK', 'BLOCKED'], recipient: 'Coordinator' }],
        'Product Design': [{ signals: ['PD-APPROVED', 'PD-FEEDBACK', 'BLOCKED'], recipient: 'Coordinator' }],
        'Product Strategy': [{ signals: ['PROPOSAL', 'PS-APPROVED', 'PS-FEEDBACK'], recipient: 'Coordinator' }],
        'Security Auditor': [{ signals: ['SECURITY-APPROVED', 'SECURITY-FEEDBACK', 'BLOCKED'], recipient: 'Coordinator' }],
      },
      starter: {
        Coordinator: [
          { signals: ['START NOW', 'RESUME NOW', 'REVIEW NOW', 'HOLD', 'PING'], recipient: 'named Worker or Reviewer' },
          { signals: ['DECISION', 'HALT'], recipient: 'cube-wide' },
        ],
        Worker: [{ signals: ['STARTING', 'PROGRESS', 'DONE', 'REVIEW-READY', 'BLOCKED'], recipient: 'Coordinator' }],
        Reviewer: [{ signals: ['APPROVED', 'FEEDBACK', 'BLOCKED'], recipient: 'Coordinator' }],
      },
      'local-model': {
        Director: [{ signals: ['DISPATCH', 'HOLD', 'APPROVED'], recipient: 'Shaper' }],
        Shaper: [
          { signals: ['EXECUTE PACKET', 'ACCEPT', 'REJECT'], recipient: 'Executor' },
          { signals: ['REVIEW-READY', 'BLOCKED'], recipient: 'Director' },
        ],
        Executor: [{ signals: ['PACKET-ECHO', 'SPEC-GAP', 'PACKET-DONE'], recipient: 'Shaper' }],
      },
    };
    const declaredPrefixes: Record<string, string[]> = {
      'software-dev': [
        'STARTING', 'PROGRESS', 'ACK', 'PONG', 'PUSHING',
        'DONE', 'REVIEW-READY',
        'REVIEW-FEEDBACK', 'RQ-FEEDBACK', 'SECURITY-FEEDBACK', 'PD-FEEDBACK', 'PS-FEEDBACK',
        'REVIEW-APPROVED', 'RQ-APPROVED', 'SECURITY-APPROVED', 'PD-APPROVED', 'PS-APPROVED',
        'BLOCKED', 'START NOW', 'RESUME NOW', 'REVIEW NOW', 'HOLD', 'PING',
        'QUESTION', 'ASK', 'ANSWER', 'HEADS-UP', 'PROPOSAL', 'DECISION', 'HALT', 'MERGED',
      ],
      starter: [
        'STARTING', 'PROGRESS', 'ACK', 'PONG', 'DONE', 'REVIEW-READY', 'FEEDBACK',
        'APPROVED', 'BLOCKED', 'START NOW', 'RESUME NOW', 'REVIEW NOW', 'HOLD', 'PING',
        'QUESTION', 'ASK', 'ANSWER', 'HEADS-UP', 'DECISION', 'HALT',
      ],
      'local-model': [
        'PACKET-ECHO', 'SPEC-GAP', 'PACKET-DONE', 'EXECUTE PACKET', 'ACCEPT', 'REJECT',
        'BLOCKED', 'REVIEW-READY', 'DISPATCH', 'HOLD', 'APPROVED',
        'QUESTION', 'ANSWER', 'HEADS-UP', 'DECISION',
      ],
    };

    for (const [templateName, roles] of Object.entries(worksheet)) {
      const template = TEMPLATES[templateName];
      const declared = template.message_taxonomy?.flatMap((entry) => entry.prefixes ?? []) ?? [];
      const prefixes = new Set(declared);
      expect(declared, `${templateName} complete declared taxonomy`).toEqual(
        declaredPrefixes[templateName],
      );
      const combinedRoleText = template.roles.map((role) => role.detailed_description).join('\n');
      for (const prefix of declaredPrefixes[templateName]) {
        expect(combinedRoleText, `${templateName} assigns ${prefix} to a playbook`).toContain(prefix);
      }
      for (const [roleName, routes] of Object.entries(roles)) {
        const text = template.roles.find((role) => role.name === roleName)!.detailed_description;
        expect(text, `${templateName}/${roleName} teaches structured routing`).toContain('`to:`');
        for (const route of routes) {
          expect(text, `${templateName}/${roleName} names its recipient`).toContain(route.recipient);
          for (const signal of route.signals) {
            expect(text, `${templateName}/${roleName} names ${signal}`).toContain(signal);
            expect(prefixes, `${templateName} taxonomy routes ${signal}`).toContain(signal);
          }
        }
      }
    }

    for (const template of Object.values(TEMPLATES)) {
      const text = template.roles.map((role) => role.detailed_description).join('\n');
      expect(text).toContain('Naming a recipient inside the message text does not route it');
      expect(text).toContain('unrouted message broadcasts');
    }
  });

  it('routes questions, answers, and heads-up messages directly', () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const [className, prefix] of [
        ['peer-question', 'QUESTION'],
        ['peer-answer', 'ANSWER'],
        ['peer-heads-up', 'HEADS-UP'],
      ]) {
        const entry = template.message_taxonomy?.find((candidate) => candidate.class === className);
        expect(entry).toMatchObject({ routing: 'directed' });
        expect(entry?.prefixes).toContain(prefix);
      }
    }
    for (const templateName of ['software-dev', 'starter']) {
      const question = TEMPLATES[templateName].message_taxonomy?.find(
        (entry) => entry.class === 'peer-question',
      );
      expect(question?.prefixes).toContain('ASK');
    }
    const director = TEMPLATES['local-model'].roles.find((role) => role.name === 'Director')!
      .detailed_description;
    const shaper = TEMPLATES['local-model'].roles.find((role) => role.name === 'Shaper')!
      .detailed_description;
    for (const signal of ['QUESTION', 'ANSWER', 'HEADS-UP']) {
      expect(director).toContain(signal);
      expect(shaper).toContain(signal);
    }
  });

  it('keeps #1118 process rules at Coordinator and reviewer role scope', () => {
    const coordinators = [
      TEMPLATES['software-dev'].roles.find((role) => role.name === 'Coordinator')!,
      TEMPLATES.starter.roles.find((role) => role.name === 'Coordinator')!,
    ];
    for (const role of coordinators) {
      expect(role.detailed_description).toContain(COORDINATOR_FINDING_DISPATCH_DISCIPLINE);
      expect(role.detailed_description).not.toContain(REVIEWER_FINDING_DISCIPLINE);
    }

    const reviewers = [
      ...['Code Reviewer', 'Release Quality', 'Product Design', 'Product Strategy', 'Security Auditor']
        .map((name) => TEMPLATES['software-dev'].roles.find((role) => role.name === name)!),
      TEMPLATES.starter.roles.find((role) => role.name === 'Reviewer')!,
    ];
    for (const role of reviewers) {
      expect(role.detailed_description).toContain(REVIEWER_FINDING_DISCIPLINE);
      expect(role.detailed_description).not.toContain(COORDINATOR_FINDING_DISPATCH_DISCIPLINE);
    }

    for (const template of Object.values(TEMPLATES)) {
      expect(template.cube_directive).not.toContain(COORDINATOR_FINDING_DISPATCH_DISCIPLINE);
      expect(template.cube_directive).not.toContain(REVIEWER_FINDING_DISCIPLINE);
    }

    for (const phrase of [
      'open ASK or an unverified condition',
      'Hold the rework until the ANSWER lands or the finding is withdrawn',
      'Never post an unanswered ASK and the consequences that depend on it in the same entry',
      'The ASK goes alone; the finding follows the answer',
      'a post naming a path and a consequence is actionable on its face',
    ]) {
      expect(`${COORDINATOR_FINDING_DISPATCH_DISCIPLINE}\n${REVIEWER_FINDING_DISCIPLINE}`).toContain(phrase);
    }
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
