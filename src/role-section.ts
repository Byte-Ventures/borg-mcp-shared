/**
 * Role-text section parsing and granular section patching.
 *
 * This module remains platform-dependency-free so clients, servers, and tests
 * all use one canonical parser without importing runtime or storage adapters.
 *
 * ## Why not markdown `##` headings
 *
 * Real role `detailed_description` text (see `client/src/templates.ts`)
 * does NOT use `##` headings. It is structured as:
 *
 *   - a PREAMBLE — free prose before the first label line
 *     (e.g. "You implement changes to the codebase…");
 *   - one or more SECTIONS, each headed by a PLAIN-LABEL LINE — a line
 *     that is a short label terminated by a single trailing colon and
 *     nothing else (e.g. `Workflow:`, `Project conventions:`,
 *     `Your job:`, `Log conventions you use:`);
 *   - TRAILING inlined `${ESCALATION_DISCIPLINE}` / `${...}` constant
 *     text woven onto the end of the field. That text uses `**bold:**`
 *     markdown emphasis, NOT bare label lines, so it is NOT a section
 *     boundary — it falls into the last label section as literal text.
 *
 * A parser that splits on `##` finds ZERO sections in real role text.
 * The label-line delimiter below matches the ACTUAL structure.
 *
 * ## Byte-identical round-trip invariant
 *
 * `serializeSections(parseRoleSections(text)) === text` for ANY input.
 * The parser does not trim, normalize newlines, or otherwise rewrite
 * bytes — each section's `body` retains the exact slice (including its
 * heading line and the newline that terminates it) so concatenation
 * reproduces the original field verbatim. The single named-fragment
 * mutation is therefore the ONLY byte-level change a patch makes.
 */

/** What kind of label heads a section. */
export type RoleSectionKind = 'preamble' | 'label';

export interface RoleSection {
  /**
   * The section's label WITHOUT the trailing colon, trimmed
   * (e.g. "Workflow", "Project conventions"). `null` for the preamble
   * (the pre-first-label span). Used as the addressing key for patches.
   */
  heading: string | null;
  kind: RoleSectionKind;
  /**
   * The EXACT source slice for this section, including its heading line
   * (for label sections) and every byte through to (but not including)
   * the next section's heading line. Concatenating every section's
   * `body` in order reproduces the original text byte-for-byte.
   */
  body: string;
}

export type RoleSectionPatchOp =
  | { action: 'replace'; heading: string; body: string }
  | { action: 'insert'; heading: string; body: string; after?: string | null }
  | { action: 'delete'; heading: string };

/**
 * Test whether a single line is a plain-label section heading.
 *
 * Rules (deliberately narrow to avoid false positives against prose
 * that merely contains a colon):
 *   - no leading whitespace (label lines start at column 0);
 *   - the line ends with exactly one `:`;
 *   - the text before the colon is non-empty, contains no other `:`,
 *     and is "short" (≤ 60 chars) — long colon-terminated prose lines
 *     are not labels;
 *   - the label is not a markdown emphasis run (does not start with
 *     `*`, `-`, `#`, `>` or backtick) — those are list/markdown lines,
 *     not plain labels (the woven `**Dense communication discipline:**`
 *     constant headings must NOT be treated as section boundaries).
 */
export function isLabelLine(line: string): boolean {
  // Leading whitespace disqualifies (label lines are flush-left).
  if (/^\s/.test(line)) return false;
  if (!line.endsWith(':')) return false;
  const label = line.slice(0, -1);
  if (label.length === 0) return false;
  if (label.length > 60) return false;
  // Exactly one colon total (the trailing one).
  if (label.includes(':')) return false;
  // Markdown/list/quote/code lead-ins are not plain labels.
  if (/^[*\-#>`]/.test(label)) return false;
  return true;
}

/**
 * Parse role `detailed_description` text into ordered sections.
 *
 * The result always round-trips byte-identical through
 * `serializeSections`. An empty string yields a single empty preamble
 * section so callers always have a stable shape to address.
 */
export function parseRoleSections(text: string): RoleSection[] {
  const sections: RoleSection[] = [];
  const lines = text.split('\n');

  // Reconstruct each line WITH its terminating newline so that the
  // concatenation is lossless. `split('\n')` drops the separators; we
  // re-append '\n' to every line except the last (which had no trailing
  // newline in the source unless the source ended with one — in which
  // case the final split element is '' and contributes nothing).
  const lineWithSep = (idx: number): string =>
    idx < lines.length - 1 ? lines[idx] + '\n' : lines[idx];

  let currentHeading: string | null = null;
  let currentKind: RoleSectionKind = 'preamble';
  let currentBody = '';
  let started = false;

  const flush = () => {
    sections.push({ heading: currentHeading, kind: currentKind, body: currentBody });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isLabelLine(raw)) {
      // Close the in-progress section (preamble or previous label) and
      // open a new label section headed by this line.
      flush();
      currentHeading = raw.slice(0, -1).trim();
      currentKind = 'label';
      currentBody = lineWithSep(i);
      started = true;
    } else {
      currentBody += lineWithSep(i);
      started = true;
    }
  }

  // Always emit the final in-progress section. For empty input this is a
  // single empty preamble (started === false, currentBody === '').
  if (started || sections.length === 0) {
    flush();
  }

  return sections;
}

/** Concatenate sections back into the original field text. */
export function serializeSections(sections: RoleSection[]): string {
  return sections.map((s) => s.body).join('');
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Build the body for a freshly inserted/replaced label section from a
 * heading + caller-supplied body text.
 *
 * The heading line is rendered as `<heading>:` on its own line. The
 * caller's `body` is the text BELOW the heading. We guarantee the
 * section body ends with a single trailing newline so adjacent sections
 * stay separated when re-serialized (matching how real role text
 * separates label sections with blank lines is the caller's choice via
 * their body text; we only ensure the structural newline).
 */
function renderLabelSection(heading: string, body: string): string {
  const headingLine = `${heading.trim()}:\n`;
  if (body === '') return headingLine;
  // Ensure the body ends with a newline so the next section's heading
  // starts on its own line.
  const normalizedBody = body.endsWith('\n') ? body : body + '\n';
  return headingLine + normalizedBody;
}

/**
 * Guarantee the section at `idx` ends in a newline before a new section
 * heading is glued on after it.
 *
 * Real role `detailed_description` text (every template role) ends WITHOUT
 * a trailing newline — it closes on the woven `${...DISCIPLINE}` constant.
 * Appending a `<heading>:` line directly onto such text would fuse the
 * heading onto the prior section's last line, so the heading is no longer
 * a flush-left label and the inserted section is LOST on re-parse. Adding
 * the structural newline here keeps the inserted heading on its own line.
 *
 * No-ops when the preceding body is empty (an empty preamble needs no
 * separator) or already ends in '\n' (preserves the already-correct case
 * byte-for-byte).
 */
function ensureTrailingNewline(sections: RoleSection[], idx: number): void {
  if (idx < 0 || idx >= sections.length) return;
  const prev = sections[idx];
  if (prev.body !== '' && !prev.body.endsWith('\n')) {
    sections[idx] = { ...prev, body: prev.body + '\n' };
  }
}

/**
 * Apply a single section-level patch to role text, returning the new
 * full field text. Every other byte is preserved.
 *
 *   - replace: overwrite the matched section's body with a re-rendered
 *     `<heading>:\n<body>` block. The heading match is case-insensitive
 *     on the label; the re-rendered heading uses the supplied casing.
 *   - insert: add a new label section. Placed after the section named by
 *     `after` (case-insensitive), or appended at the end when `after` is
 *     omitted/null. Rejects if a section with the same heading already
 *     exists (use replace instead).
 *   - delete: drop the matched section entirely.
 *
 * Throws when the target section is missing (replace/delete) or already
 * present (insert), or when `after` does not resolve.
 */
export function patchRoleSectionText(text: string, op: RoleSectionPatchOp): string {
  const sections = parseRoleSections(text);
  const targetKey = normalizeHeading(op.heading);

  if (op.action === 'replace') {
    const idx = sections.findIndex(
      (s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey
    );
    if (idx === -1) {
      throw new Error(`Role section "${op.heading}" not found. Use action="insert" to add it.`);
    }
    sections[idx] = {
      heading: op.heading.trim(),
      kind: 'label',
      body: renderLabelSection(op.heading, op.body),
    };
    return serializeSections(sections);
  }

  if (op.action === 'delete') {
    const idx = sections.findIndex(
      (s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey
    );
    if (idx === -1) {
      throw new Error(`Role section "${op.heading}" not found.`);
    }
    sections.splice(idx, 1);
    return serializeSections(sections);
  }

  // insert
  const exists = sections.some(
    (s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey
  );
  if (exists) {
    throw new Error(`Role section "${op.heading}" already exists. Use action="replace" to overwrite it.`);
  }
  const newSection: RoleSection = {
    heading: op.heading.trim(),
    kind: 'label',
    body: renderLabelSection(op.heading, op.body),
  };

  if (op.after == null) {
    ensureTrailingNewline(sections, sections.length - 1);
    sections.push(newSection);
    return serializeSections(sections);
  }

  const afterKey = normalizeHeading(op.after);
  const afterIdx = sections.findIndex(
    (s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === afterKey
  );
  if (afterIdx === -1) {
    throw new Error(`Cannot insert after section "${op.after}" — it does not exist.`);
  }
  ensureTrailingNewline(sections, afterIdx);
  sections.splice(afterIdx + 1, 0, newSection);
  return serializeSections(sections);
}
