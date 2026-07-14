export function isLabelLine(line) {
    if (/^\s/.test(line))
        return false;
    if (!line.endsWith(':'))
        return false;
    const label = line.slice(0, -1);
    if (label.length === 0)
        return false;
    if (label.length > 60)
        return false;
    if (label.includes(':'))
        return false;
    if (/^[*\-#>`]/.test(label))
        return false;
    return true;
}
export function parseRoleSections(text) {
    const sections = [];
    const lines = text.split('\n');
    const lineWithSep = (idx) => idx < lines.length - 1 ? lines[idx] + '\n' : lines[idx];
    let currentHeading = null;
    let currentKind = 'preamble';
    let currentBody = '';
    let started = false;
    const flush = () => {
        sections.push({ heading: currentHeading, kind: currentKind, body: currentBody });
    };
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (isLabelLine(raw)) {
            flush();
            currentHeading = raw.slice(0, -1).trim();
            currentKind = 'label';
            currentBody = lineWithSep(i);
            started = true;
        }
        else {
            currentBody += lineWithSep(i);
            started = true;
        }
    }
    if (started || sections.length === 0) {
        flush();
    }
    return sections;
}
export function serializeSections(sections) {
    return sections.map((s) => s.body).join('');
}
function normalizeHeading(value) {
    return value.trim().toLowerCase();
}
function renderLabelSection(heading, body) {
    const headingLine = `${heading.trim()}:\n`;
    if (body === '')
        return headingLine;
    const normalizedBody = body.endsWith('\n') ? body : body + '\n';
    return headingLine + normalizedBody;
}
function ensureTrailingNewline(sections, idx) {
    if (idx < 0 || idx >= sections.length)
        return;
    const prev = sections[idx];
    if (prev.body !== '' && !prev.body.endsWith('\n')) {
        sections[idx] = { ...prev, body: prev.body + '\n' };
    }
}
export function patchRoleSectionText(text, op) {
    const sections = parseRoleSections(text);
    const targetKey = normalizeHeading(op.heading);
    if (op.action === 'replace') {
        const idx = sections.findIndex((s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey);
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
        const idx = sections.findIndex((s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey);
        if (idx === -1) {
            throw new Error(`Role section "${op.heading}" not found.`);
        }
        sections.splice(idx, 1);
        return serializeSections(sections);
    }
    const exists = sections.some((s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === targetKey);
    if (exists) {
        throw new Error(`Role section "${op.heading}" already exists. Use action="replace" to overwrite it.`);
    }
    const newSection = {
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
    const afterIdx = sections.findIndex((s) => s.kind === 'label' && s.heading != null && normalizeHeading(s.heading) === afterKey);
    if (afterIdx === -1) {
        throw new Error(`Cannot insert after section "${op.after}" — it does not exist.`);
    }
    ensureTrailingNewline(sections, afterIdx);
    sections.splice(afterIdx + 1, 0, newSection);
    return serializeSections(sections);
}
//# sourceMappingURL=role-section.js.map