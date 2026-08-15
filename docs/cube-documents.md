# Cube document contract

Protocol v10 adds a cube-scoped working set for immutable text documents.
Implementations accept only UTF-8 `text/markdown` and `text/plain` content. Each
document has one opaque full id and a required, non-unique title of at most 120
Unicode characters. Titles support discovery; only the complete id addresses a
document.

The default per-document budget is 65,536 bytes and the default active budget
per cube is 524,288 bytes. Servers may configure both budgets, validate their
configuration at startup, and refuse a write atomically when either budget is
exceeded. Superseded revisions continue to count until explicitly removed.

Creation may carry `supersedes`, which must identify an existing document in the
same cube. A document can be superseded by at most one later revision, producing
a linear chain. Supersession never edits content or hides a revision.

All cube seats may read documents. A write-authorized seat may create one. Only
the author or a cube manager may remove it. Removal hides the document from the
active list and active-byte budget but retains its immutable content and audit
metadata for exact-id resolution by coordination records.

Log creation may carry a structured `documents` array of full ids. The server
validates every id before writing the entry. Log reads and streams render each
citation as id, title, UTF-8 size, and current active, superseded, or removed
state. Inline text that resembles an id has no citation semantics.

Log text up to 1,024 UTF-8 bytes is accepted silently. Text through 4,096 bytes
is accepted with the `STORE_AS_DOCUMENT` advisory. Larger log text is rejected;
the caller stores the detail as a document and cites it from a shorter entry.
