export function validateSha512(value: string, max?: number): string | null;
export function validatePositiveInt(name: string, value: string): string | null;
export function validateSourceRun(
  run: { path: string; event: string; head_branch: string; head_sha: string; conclusion: string | null; run_attempt: number },
  expectedPath: string,
  expectedEvent: string,
  expectedTag: string,
  expectedSha: string,
  expectedAttempt: number,
): string | null;
export function validateArtifactContents(artifactFiles: string[], expectedTarball: string): string | null;
export function validateTarballHash(actualSha512: string, expectedSha512: string): string | null;
export function validateRunEvidence(evidence: string, expectedRunId: string, expectedAttempt: string): string | null;
