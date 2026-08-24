export function buildReleaseTransform(
  baseFiles: ReadonlyMap<string, string>,
  oldVersion: string,
  newVersion: string,
): Map<string, string>;

export function prepareRelease(root: string, targetVersion: string): Promise<Readonly<{
  oldVersion: string;
  newVersion: string;
  paths: readonly string[];
}>>;

export function verifyReleaseIdentity(
  root: string,
  base: string,
  candidate: string,
): Readonly<{
  base: string;
  candidate: string;
  oldVersion: string;
  newVersion: string;
  paths: readonly string[];
}>;
