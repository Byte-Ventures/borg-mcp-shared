import { describe, expect, it } from 'vitest';
import {
  ANTI_PASSIVE_STANDING_DISCIPLINE,
  TEMPLATES,
  getTemplate,
  listTemplateNames,
  resolveCubeDirectiveForApply,
  resolveCubeDirectiveForCreate,
  resolveMessageTaxonomyForCreate,
  type Template,
} from '../src/templates.js';
import * as generatedTemplates from '../dist/templates.js';

const ROLE_BUDGET = 12_000;

describe('cube templates', () => {
  it('registers the starter and software-dev templates', () => {
    expect(listTemplateNames()).toEqual(['starter', 'software-dev']);
    expect(getTemplate('missing')).toBeNull();
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
      const coordinatingRole = template.roles.find((role) => role.name === 'Coordinator');
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
        expect(role.detailed_description.length, `${templateName}/${role.name}`).toBeLessThanOrEqual(
          ROLE_BUDGET,
        );
      }
    }
  });

  it('binds Coordinator activation without granting scope', () => {
    const coordinator = TEMPLATES['software-dev'].roles.find((role) => role.name === 'Coordinator')!;
    for (const phrase of [
      'START NOW',
      'RESUME NOW',
      'REVIEW NOW',
      'HOLD',
      'ACK is receipt only',
      'STARTING',
      'PROGRESS',
      'Never manufacture work',
    ]) {
      expect(coordinator.detailed_description).toContain(phrase);
    }
    expect(coordinator.detailed_description).toContain('does not authorize');
  });

  it('keeps review routing serialized through the coordinating seat', () => {
    for (const template of Object.values(TEMPLATES)) {
      const review = template.message_taxonomy?.find((entry) => entry.class === 'review-request');
      expect(review).toMatchObject({
        routing: 'directed',
        default_to: ['coordinator', 'queen'],
      });
    }
  });

  it('keeps only decisions and halts cube-wide', () => {
    for (const template of Object.values(TEMPLATES)) {
      for (const entry of template.message_taxonomy ?? []) {
        if (entry.class === 'cube-wide') {
          expect(entry.routing).toBe('broadcast');
          expect(entry.prefixes).toEqual(['DECISION', 'HALT']);
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
