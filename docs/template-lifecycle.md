# Built-in template lifecycle

Built-in templates are versioned package data. `src/templates.ts` is the source of truth for their names, presentation copy, cube directives, message taxonomies, roles, flags, short descriptions, and detailed playbooks. A running cube is not a writable upstream for that source.

## Supported lifecycle

### Edit one cube locally

A client with live manage authority for the cube may use the role and cube mutation operations to create or update roles, patch one plain-label role section, or update the cube directive or message taxonomy. Prefer a one-section role patch when one section changes; it preserves every other byte. Local edits affect only that cube. They neither mutate `src/templates.ts` nor create a built-in variant.

Read the canonical role or cube state before editing and read it back after the mutation. The server's canonical state is the result to verify. The package does not provide an automatic local-change-to-template audit ledger or promotion path.

### Promote a trusted local improvement

Promotion is a normal reviewed repository change, not a runtime copy operation:

1. Compare the local text with the current built-in source and identify the behavior and failure it addresses.
2. Generalize only what applies to new cubes across supported implementations and hosts. Remove repository-host, operator-machine, project, and live-cube details.
3. Edit `src/templates.ts` and the focused existing tests that pin the affected invariant. Preserve plain-label sections and the role-section round-trip contract.
4. Review the complete source change through the repository's protected change mechanism. The change history and review are the built-in template's durable audit record.
5. Publish the reviewed package through the normal immutable shared-package release workflow.
6. Update client and server to the same exact `borgmcp-shared` version as a matched pair. The client update path rejects a published pair whose exact shared pins differ.

There is no direct promotion from server state, no package write from a running cube, and no unreviewed operator override of a built-in template.

### Apply a released template

New cubes created through an updated client/server pair receive the template data shipped by that exact shared package. An existing non-empty cube remains locally owned: template application does not overwrite its directive (`resolveCubeDirectiveForApply` returns `null`). A release does not rewrite existing roles, directives, or taxonomies. An operator who wants a released improvement in an existing cube applies that specific local edit deliberately and verifies canonical readback.

## Authority and audit

Cube-local authority and package authority are separate:

- A cube-local edit requires the cube's live manage authority and is verified against canonical server readback. It is not evidence that a built-in changed.
- A built-in edit requires repository change authority, review of the source diff, and the package release gates. Git history, review, immutable tag, and package artifact are its audit chain.
- A shared release alone is not delivery to users. Client and server must both pin the same exact shared version; neither a range nor one-sided pin movement is supported.
- Merge, tag, publication, and consumer pin changes remain separate authorized actions. Editing a local cube grants none of them.

## Compatibility, versions, and migration

Built-in templates have no independent runtime version or negotiation protocol. Their version is the `borgmcp-shared` package version that contains them.

A role-text, directive, or taxonomy change ships in a new shared package version. Client and server consume the same exact version. If a change also alters a wire-visible template name or closed protocol acceptance set, follow the protocol change policy: update the exact protocol tag and implementation-neutral conformance vectors, then coordinate both consumers. Text-only playbook improvements do not invent a protocol migration.

Existing cubes are snapshots with local ownership, not replicas. They do not auto-migrate or auto-synchronize. This no-clobber rule avoids erasing operator edits and avoids making package upgrades mutate active coordination policy. Migration, when desired, is an explicit cube-local edit of named fields or sections.

## Validation and conformance

Use the existing focused controls; do not add a second template lifecycle mechanism:

- `test/templates.test.ts` pins the built-in set, expected software-development roles and flags, host-neutral presentation copy, authority/scope language, role-size budgets, Builder minimum-sufficient-change ordering, taxonomy routing, generated/source equality, and no-clobber resolution.
- `test/role-section.test.ts` pins plain-label parsing, byte-identical parse/serialize for real template roles, and single-section replacement/insertion/deletion without clobbering unrelated text.
- `test/packed-artifact.test.ts` installs the packed package and verifies the public named-template creation contract and shipped role text from the consumer surface.
- `CUBE_TEMPLATE_ACCEPTANCE_CONFORMANCE` pins the closed accepted template-name set and invalid-name rejection. Stateful create vectors pin template identity to retry behavior.

Review remains the host-neutrality control: role text must avoid a specific repository host, CI vendor, operating system adapter, local path, or project-only workflow unless the template's documented scope requires it. This is a semantic review question, not a keyword validator. Validate both source and the built/packed consumer artifact because built-ins are delivered through the package.

## Rejected alternatives

- Runtime-editable built-ins: rejected because package source and running server state would become competing authorities without one review or release history.
- Automatic promotion from a local cube: rejected because live text may contain project-specific policy, host assumptions, temporary experiments, or unreviewed mistakes.
- Automatic synchronization into existing cubes: rejected because it would clobber local policy and role edits. Existing cubes remain unchanged unless an operator applies a named edit.
- Separate template versions or compatibility negotiation: rejected because package identity and exact matched consumer pins already provide the delivery boundary; another version axis would add ambiguity without preserving any supported behavior.
- A new lifecycle validator or audit service: rejected because current behavioral tests, role-section round trips, protected review, and artifact gates already cover the enforceable invariants. Host-neutrality and promotion judgment remain review responsibilities.
