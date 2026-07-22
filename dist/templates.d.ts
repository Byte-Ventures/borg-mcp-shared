export interface TemplateRole {
    name: string;
    short_description: string;
    detailed_description: string;
    is_default?: boolean;
    is_mandatory?: boolean;
    is_human_seat?: boolean;
    can_broadcast?: boolean;
    receives_all_direct?: boolean;
}
export interface MessageTaxonomyClass {
    class: string;
    prefixes?: string[];
    routing: 'broadcast' | 'directed';
    default_to?: string[];
    lifecycle?: 'dispatch' | 'completion';
}
export type MessageTaxonomy = MessageTaxonomyClass[];
export interface Template {
    name: string;
    description: string;
    roles: TemplateRole[];
    cube_directive?: string;
    message_taxonomy?: MessageTaxonomy;
}
export declare const ESCALATION_DISCIPLINE = "\n\nEscalation:\n- Stay within the routed outcome and your role's authority.\n- Report a blocker to the coordinating role with the missing input, evidence, and smallest useful options.\n- A proposal, finding, or idle capacity does not authorize new work.\n- The coordinating role escalates scope, priority, irreversible actions, or product decisions to the human Queen.\n- Waiting is valid when work is complete, blocked, or awaiting an authorized transition.";
export declare const ANTI_PASSIVE_STANDING_DISCIPLINE = "\n\nActivation and waiting:\n- A routed assignment is active only after STARTING or substantive PROGRESS; ACK is receipt only.\n- The coordinating seat verifies activation and follows up on a missed start.\n- Do not manufacture work to avoid being idle. Waiting is correct when no authorized action is available.\n- Spare capacity, an open queue, or a possible improvement does not grant scope.";
export declare const SERIALIZED_REVIEW_ROUNDS_DISCIPLINE = "\n\nReview rounds:\n- Bind every review to one exact artifact revision.\n- Route only the reviews required by the changed surface, in the declared order.\n- One consolidated verdict per lens and revision.\n- A blocking fix creates a new revision and restarts required gates; older approvals do not carry forward.\n- After two blocked rounds, stop and ask the human before opening an exceptional round.\n- Findings outside the authorized outcome are reported separately and do not expand or gate the current work.";
export declare const RELEASE_CYCLE_SHAPES = "\n\nIntegration and release:\n- Review approval does not itself authorize merge, deployment, publication, tagging, or release.\n- Perform those actions only when the user request or a standing delegation explicitly includes them.\n- Use the repository's protected workflow and bind every gate to the exact revision being integrated.\n- Never substitute, move, overwrite, or rerun an immutable release artifact without explicit recovery authority.";
export declare const GIT_OPERATIONAL_DISCIPLINE_BUILDER = "\n\nGit safety:\n- Work only in the assigned repository and worktree; preserve unrelated user changes.\n- Verify branch, base, and diff scope before committing.\n- Never rewrite shared history, force-push, reset away another person's work, or delete branches without explicit authority.";
export declare const GIT_OPERATIONAL_DISCIPLINE_COORDINATOR = "\n\nGit integration safety:\n- Verify repository, branch, exact revision, ancestry, and required gates before integration.\n- Preserve unrelated work and never use destructive recovery commands on another worktree.\n- Merge, tag, push, or delete only when the authorized workflow includes that action.";
export declare const WAKE_PATH_MONITOR_DISCIPLINE = "\n\nWake discipline:\n- Use the configured wake mechanism for active work and drain unread activity before acting.\n- A transport heartbeat is not proof that a drone started the assignment; require STARTING or substantive PROGRESS.\n- Treat a terminal lifecycle state as terminal and a reversible suspension as resumable only after an explicit resume.\n- Use an actual heartbeat request only when liveness is uncertain; do not turn routine waiting into work.";
export declare const WORKER_BUNDLE_DRY_RUN_DISCIPLINE = "\n\nEnvironment-owned verification:\n- When a required check needs permissions or an environment this seat lacks, report the exact check and revision.\n- The coordinating seat routes that one check to an authorized operator; it does not broaden the implementation slice.\n- A result from another revision does not satisfy the gate.";
export declare const PUSH_DISCIPLINE_COORDINATOR = "\n\nPush discipline:\n- Before pushing an integration result, fetch, verify the target and exact revision, and confirm the worktree is clean.\n- Do not force-push or move an existing tag without explicit recovery authority.";
export declare const PUSH_DISCIPLINE_BUILDER = "\n\nPush discipline:\n- Push only the assigned branch after verifying the staged paths and final diff.\n- Do not force-push, rebase a shared branch, or publish from a local substitute artifact.";
export declare const UNIVERSAL_SAFETY_DISCIPLINES: string[];
export declare const ROLE_SCOPED_SAFETY_DISCIPLINES: string[];
export declare const DRONE_ADDRESSING_CONVENTION = "\n\nDrone addressing:\n- Route directed work with the stable short UUID shown by Borg, not a mutable display label.\n- Keep each dispatch self-contained: recipient, exact item, first action, and completion evidence.";
export declare const TEMPLATES: Record<string, Template>;
export declare function getTemplate(name: string): Template | null;
export declare function listTemplateNames(): string[];
export declare function resolveCubeDirectiveForCreate(operatorSupplied: string, template: Template | null): string;
export declare function resolveCubeDirectiveForApply(currentCubeDirective: string | null | undefined, template: Template): string | null;
export declare function resolveMessageTaxonomyForCreate(operatorSupplied: MessageTaxonomy | null | undefined, template: Template | null): MessageTaxonomy | null;
//# sourceMappingURL=templates.d.ts.map