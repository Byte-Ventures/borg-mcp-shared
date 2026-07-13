import { describe, expect, it } from 'vitest';
import {
  isLabelLine,
  parseRoleSections,
  serializeSections,
  patchRoleSectionText,
} from '../src/role-section.js';
// Real role-text artifacts. templates.ts has no runtime imports (only
// type declarations + string constants), so it is safe to import from a
// worker (node-project) test for the byte-identical round-trip assertion.
import { TEMPLATES } from '../src/templates.js';

const SOFTWARE_DEV = TEMPLATES['software-dev'];
const STARTER = TEMPLATES['starter'];

describe('isLabelLine', () => {
  it('accepts flush-left short colon-terminated labels', () => {
    expect(isLabelLine('Workflow:')).toBe(true);
    expect(isLabelLine('Project conventions:')).toBe(true);
    expect(isLabelLine('Your job:')).toBe(true);
    expect(isLabelLine('Log conventions you use:')).toBe(true);
  });

  it('rejects indented lines (list items, sub-bullets)', () => {
    expect(isLabelLine('  Workflow:')).toBe(false);
    expect(isLabelLine('- something:')).toBe(false);
  });

  it('rejects markdown emphasis headings (the woven discipline constants)', () => {
    expect(isLabelLine('**Dense communication discipline:**')).toBe(false);
    expect(isLabelLine('**Workflow:**')).toBe(false);
    expect(isLabelLine('# Heading:')).toBe(false);
  });

  it('rejects lines that do not end in a colon', () => {
    expect(isLabelLine('You implement changes to the codebase.')).toBe(false);
    expect(isLabelLine('Workflow')).toBe(false);
  });

  it('rejects long colon-terminated prose lines', () => {
    const longProse =
      'When you accept a review verdict and then look for the merge-base plus head SHA quoted in the post:';
    expect(isLabelLine(longProse)).toBe(false);
  });

  it('rejects lines with an internal colon', () => {
    expect(isLabelLine('http://example.com:')).toBe(false);
  });
});

describe('parseRoleSections / serializeSections — round-trip', () => {
  it('round-trips empty string', () => {
    const sections = parseRoleSections('');
    expect(serializeSections(sections)).toBe('');
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('preamble');
  });

  it('captures a preamble before the first label', () => {
    const text = 'Lead prose line one.\nLine two.\n\nWorkflow:\n- do a thing\n';
    const sections = parseRoleSections(text);
    expect(sections[0].kind).toBe('preamble');
    expect(sections[0].heading).toBeNull();
    expect(sections.find((s) => s.heading === 'Workflow')).toBeTruthy();
    expect(serializeSections(sections)).toBe(text);
  });

  it('round-trips a simple synthetic multi-section field byte-identical', () => {
    const text =
      'You do the thing.\n\n' +
      'Workflow:\n- step one\n- step two\n\n' +
      'Project conventions:\n- TDD where it applies.\n';
    const sections = parseRoleSections(text);
    const headings = sections.map((s) => s.heading);
    expect(headings).toEqual([null, 'Workflow', 'Project conventions']);
    expect(serializeSections(sections)).toBe(text);
  });

  // LOAD-BEARING: real cube role-text MUST survive parse -> (no-op) ->
  // serialize byte-for-byte. These assert against the ACTUAL artifacts,
  // not an assumed markdown shape.
  const realRoles: Array<{ template: string; name: string; text: string }> = [
    ...SOFTWARE_DEV.roles.map((r) => ({
      template: 'software-dev',
      name: r.name,
      text: r.detailed_description,
    })),
    ...STARTER.roles.map((r) => ({
      template: 'starter',
      name: r.name,
      text: r.detailed_description,
    })),
  ];

  for (const { template, name, text } of realRoles) {
    it(`round-trips ${template}/${name} byte-identical`, () => {
      const sections = parseRoleSections(text);
      expect(serializeSections(sections)).toBe(text);
    });
  }

  it('finds real plain-label sections in the Builder role (not zero)', () => {
    const builder = SOFTWARE_DEV.roles.find((r) => r.name === 'Builder')!;
    const sections = parseRoleSections(builder.detailed_description);
    const labels = sections.filter((s) => s.kind === 'label').map((s) => s.heading);
    // Builder text has a preamble + at least Workflow + Project conventions.
    expect(labels).toContain('Workflow');
    expect(labels).toContain('Project conventions');
    expect(sections[0].kind).toBe('preamble');
  });

  it('woven **bold:** discipline headings stay inside the last label section', () => {
    const builder = SOFTWARE_DEV.roles.find((r) => r.name === 'Builder')!;
    const sections = parseRoleSections(builder.detailed_description);
    // The trailing ESCALATION_DISCIPLINE etc. text contains
    // "**Escalation discipline:**" — it must NOT become its own section.
    const labels = sections.map((s) => s.heading);
    expect(labels).not.toContain('**Escalation discipline**');
    expect(labels).not.toContain('Escalation discipline');
    // The literal text is still present somewhere in the serialized output.
    expect(serializeSections(sections)).toContain('**Escalation discipline:**');
  });
});

describe('patchRoleSectionText — replace', () => {
  const base =
    'Preamble line.\n\n' +
    'Workflow:\n- old step\n\n' +
    'Project conventions:\n- TDD.\n';

  it('replaces a single section leaving the rest byte-identical', () => {
    const out = patchRoleSectionText(base, {
      action: 'replace',
      heading: 'Workflow',
      body: '- new step one\n- new step two\n',
    });
    expect(out).toContain('Workflow:\n- new step one\n- new step two\n');
    // Preamble + the untouched Project conventions section are intact.
    expect(out).toContain('Preamble line.\n');
    expect(out).toContain('Project conventions:\n- TDD.\n');
    expect(out).not.toContain('- old step');
    // Everything else is byte-identical: re-parse and confirm only the
    // Workflow body changed.
    const before = parseRoleSections(base);
    const after = parseRoleSections(out);
    const beforeOther = before.filter((s) => s.heading !== 'Workflow').map((s) => s.body);
    const afterOther = after.filter((s) => s.heading !== 'Workflow').map((s) => s.body);
    expect(afterOther).toEqual(beforeOther);
  });

  it('matches the heading case-insensitively', () => {
    const out = patchRoleSectionText(base, {
      action: 'replace',
      heading: 'workflow',
      body: '- replaced\n',
    });
    expect(out).toContain('workflow:\n- replaced\n');
  });

  it('throws when the section does not exist', () => {
    expect(() =>
      patchRoleSectionText(base, { action: 'replace', heading: 'Nope', body: 'x' })
    ).toThrow(/not found/i);
  });
});

describe('patchRoleSectionText — insert', () => {
  const base = 'Preamble.\n\nWorkflow:\n- step\n';

  it('appends a new section at the end when no `after`', () => {
    const out = patchRoleSectionText(base, {
      action: 'insert',
      heading: 'New section',
      body: '- content\n',
    });
    expect(out.endsWith('New section:\n- content\n')).toBe(true);
    expect(out.startsWith(base)).toBe(true);
  });

  it('inserts after a named section', () => {
    const withTwo = 'Pre.\n\nA:\n- a\n\nC:\n- c\n';
    const out = patchRoleSectionText(withTwo, {
      action: 'insert',
      heading: 'B',
      body: '- b\n',
      after: 'A',
    });
    const headings = parseRoleSections(out).map((s) => s.heading);
    expect(headings).toEqual([null, 'A', 'B', 'C']);
  });

  it('throws when inserting a duplicate heading', () => {
    expect(() =>
      patchRoleSectionText(base, { action: 'insert', heading: 'Workflow', body: 'x' })
    ).toThrow(/already exists/i);
  });

  it('throws when `after` does not resolve', () => {
    expect(() =>
      patchRoleSectionText(base, { action: 'insert', heading: 'B', body: 'x', after: 'Missing' })
    ).toThrow(/does not exist/i);
  });

  // gh#473 newline-gluing regression: real role text ends WITHOUT a
  // trailing newline (it closes on woven ${...DISCIPLINE} constants), so
  // a plain append/insert-after-last must NOT fuse the new heading onto
  // the prior section's final line — that would make the heading a
  // non-flush-left line and the inserted section would be LOST on
  // re-parse.
  describe('preceding text without a trailing newline (gh#473)', () => {
    it('append-at-end (no `after`) keeps the new heading on its own line', () => {
      const noNewline = 'Pre.\n\nWorkflow:\n- step'; // NB: no trailing '\n'
      const out = patchRoleSectionText(noNewline, {
        action: 'insert',
        heading: 'New',
        body: 'y\n',
      });
      const reparsed = parseRoleSections(out);
      const headings = reparsed.map((s) => s.heading);
      // The inserted section survives re-parse with the correct heading.
      expect(headings).toEqual([null, 'Workflow', 'New']);
      // The new section's body is intact.
      const newSection = reparsed.find((s) => s.heading === 'New')!;
      expect(newSection.body).toBe('New:\ny\n');
      // The preceding Workflow content is intact (heading + step line),
      // not corrupted into "- stepNew:".
      const workflow = reparsed.find((s) => s.heading === 'Workflow')!;
      expect(workflow.body).toContain('- step\n');
      expect(out).not.toContain('- stepNew:');
    });

    it('insert after the LAST existing section keeps the new heading on its own line', () => {
      const noNewline = 'Pre.\n\nWorkflow:\n- step'; // last section is Workflow
      const out = patchRoleSectionText(noNewline, {
        action: 'insert',
        heading: 'New',
        body: 'y\n',
        after: 'Workflow',
      });
      const reparsed = parseRoleSections(out);
      const headings = reparsed.map((s) => s.heading);
      expect(headings).toEqual([null, 'Workflow', 'New']);
      const newSection = reparsed.find((s) => s.heading === 'New')!;
      expect(newSection.body).toBe('New:\ny\n');
      const workflow = reparsed.find((s) => s.heading === 'Workflow')!;
      expect(workflow.body).toContain('- step\n');
      expect(out).not.toContain('- stepNew:');
    });

    it('plain append on a preamble-only base with no trailing newline', () => {
      const out = patchRoleSectionText('Just preamble no newline', {
        action: 'insert',
        heading: 'New',
        body: 'x\n',
      });
      const reparsed = parseRoleSections(out);
      expect(reparsed.map((s) => s.heading)).toEqual([null, 'New']);
      expect(reparsed.find((s) => s.heading === 'New')!.body).toBe('New:\nx\n');
      expect(out).not.toContain('newlineNew:');
    });

    // Real template role: every detailed_description ends WITHOUT a
    // trailing newline. Inserting a new section must keep ALL prior
    // section bodies byte-unchanged and surface the new section.
    it('insert into a REAL template role preserves every prior section byte-for-byte', () => {
      const builder = SOFTWARE_DEV.roles.find((r) => r.name === 'Builder')!;
      const text = builder.detailed_description;
      // Sanity: confirm the artifact really ends without a trailing newline
      // (the precondition that exercises the gluing path).
      expect(text.endsWith('\n')).toBe(false);

      const before = parseRoleSections(text);
      const out = patchRoleSectionText(text, {
        action: 'insert',
        heading: 'New section',
        body: '- brand new guidance\n',
      });
      const after = parseRoleSections(out);

      // The new section is present with the correct heading.
      expect(after.map((s) => s.heading)).toContain('New section');
      expect(after.find((s) => s.heading === 'New section')!.body).toBe(
        'New section:\n- brand new guidance\n'
      );

      // Every PRIOR section's body is byte-unchanged, save the structural
      // trailing newline added to the previously-last section so the new
      // heading lands flush-left. Compare with that single byte normalized.
      const priorAfter = after.filter((s) => s.heading !== 'New section');
      expect(priorAfter.length).toBe(before.length);
      for (let i = 0; i < before.length; i++) {
        const beforeBody = before[i].body;
        const afterBody = priorAfter[i].body;
        const expected =
          i === before.length - 1 && beforeBody !== '' && !beforeBody.endsWith('\n')
            ? beforeBody + '\n'
            : beforeBody;
        expect(afterBody).toBe(expected);
      }
    });
  });
});

describe('patchRoleSectionText — delete', () => {
  const base = 'Pre.\n\nWorkflow:\n- step\n\nProject conventions:\n- TDD.\n';

  it('removes a section leaving the rest byte-identical', () => {
    const out = patchRoleSectionText(base, { action: 'delete', heading: 'Workflow' });
    expect(out).not.toContain('Workflow:');
    expect(out).toContain('Pre.\n');
    expect(out).toContain('Project conventions:\n- TDD.\n');
  });

  it('throws when the section does not exist', () => {
    expect(() =>
      patchRoleSectionText(base, { action: 'delete', heading: 'Nope' })
    ).toThrow(/not found/i);
  });

  it('can round-trip replace-back to original (replace with parsed original body)', () => {
    // Delete then re-insert reconstructs an equivalent (not necessarily
    // byte-identical) field; the byte-identical guarantee is for no-op
    // parse/serialize, asserted above.
    const deleted = patchRoleSectionText(base, { action: 'delete', heading: 'Workflow' });
    const reinserted = patchRoleSectionText(deleted, {
      action: 'insert',
      heading: 'Workflow',
      body: '- step\n',
      after: null,
    });
    expect(reinserted).toContain('Workflow:\n- step\n');
  });
});
