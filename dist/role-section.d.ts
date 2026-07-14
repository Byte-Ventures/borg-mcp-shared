export type RoleSectionKind = 'preamble' | 'label';
export interface RoleSection {
    heading: string | null;
    kind: RoleSectionKind;
    body: string;
}
export type RoleSectionPatchOp = {
    action: 'replace';
    heading: string;
    body: string;
} | {
    action: 'insert';
    heading: string;
    body: string;
    after?: string | null;
} | {
    action: 'delete';
    heading: string;
};
export declare function isLabelLine(line: string): boolean;
export declare function parseRoleSections(text: string): RoleSection[];
export declare function serializeSections(sections: RoleSection[]): string;
export declare function patchRoleSectionText(text: string, op: RoleSectionPatchOp): string;
//# sourceMappingURL=role-section.d.ts.map