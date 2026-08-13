export interface GithubReleaseAuthorities {
  readonly git: (root: string, args: string[]) => string;
  readonly gitFile: (root: string, ref: string, path: string) => string;
  readonly postpublish: (name: string, version: string, integrity: string) => Promise<{
    name: string;
    version: string;
    integrity: string;
    registryState: string;
  }>;
  readonly request: (url: string, options: RequestInit) => Promise<Response>;
}

export function assembleReleaseBody(input: Readonly<{
  packageName: string;
  version: string;
  integrity: string;
  tag: string;
  commit: string;
  releaseNotes: string;
}>): string;

export function createGithubRelease(
  version: string,
  integrity: string,
  options?: Readonly<{
    root?: string;
    token?: string;
    authorities?: GithubReleaseAuthorities;
  }>,
): Promise<unknown>;
