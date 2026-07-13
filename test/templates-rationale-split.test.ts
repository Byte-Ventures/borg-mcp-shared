import { describe, expect, it } from 'vitest';
import {
  ANTI_PASSIVE_STANDING_DISCIPLINE,
  GIT_OPERATIONAL_DISCIPLINE_COORDINATOR,
  PUSH_DISCIPLINE_COORDINATOR,
  RELEASE_CYCLE_SHAPES,
  ROLE_SCOPED_SAFETY_DISCIPLINES,
  TEMPLATES,
  UNIVERSAL_SAFETY_DISCIPLINES,
  WAKE_PATH_MONITOR_DISCIPLINE,
} from '../src/templates.js';
import { parseRoleSections } from '../src/role-section.js';

describe('template role rationale boundaries', () => {
  it('keeps safety-adjacent disciplines in the role-scoped carve-out', () => {
    expect(ROLE_SCOPED_SAFETY_DISCIPLINES).toContain(ANTI_PASSIVE_STANDING_DISCIPLINE);
    expect(ROLE_SCOPED_SAFETY_DISCIPLINES).toContain(RELEASE_CYCLE_SHAPES);
  });

  it('preserves the Coordinator rationale section in the canonical template', () => {
    const coordinator = TEMPLATES['software-dev'].roles.find(
      (role) => role.name === 'Coordinator',
    );
    expect(coordinator).toBeDefined();

    const section = parseRoleSections(coordinator!.detailed_description).find(
      (candidate) =>
        candidate.kind === 'label' && candidate.heading === 'Deadlock-resolution rationale',
    );
    expect(section?.body).toContain('Coordinator deadlock-resolution failures cascade');
    expect(section?.body).toContain('the absence of resolution is expensive');
  });

  it('keeps all safety discipline text outside rationale sections', () => {
    const coordinator = TEMPLATES['software-dev'].roles.find(
      (role) => role.name === 'Coordinator',
    );
    expect(coordinator).toBeDefined();
    expect(coordinator!.detailed_description).toContain(WAKE_PATH_MONITOR_DISCIPLINE);
    expect(coordinator!.detailed_description).toContain(GIT_OPERATIONAL_DISCIPLINE_COORDINATOR);
    expect(coordinator!.detailed_description).toContain(PUSH_DISCIPLINE_COORDINATOR);

    const safety = [...UNIVERSAL_SAFETY_DISCIPLINES, ...ROLE_SCOPED_SAFETY_DISCIPLINES];
    for (const section of parseRoleSections(coordinator!.detailed_description)) {
      if (section.heading?.toLowerCase().endsWith('rationale')) {
        for (const discipline of safety) {
          expect(section.body).not.toContain(discipline);
        }
      }
    }
  });
});
