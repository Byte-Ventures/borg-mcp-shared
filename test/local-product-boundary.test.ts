import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCT_SURFACES = [
  'README.md',
  'SECURITY.md',
  'package.json',
  'src',
  'dist',
];

const RETIRED_PRODUCT_PATTERNS = [
  /borgmcp\.ai/i,
  /runEquivalentAdapterConformance/,
  /EquivalentAdapterConformanceReport/,
  /\bcloud\b/i,
  /\b(?:Cloudflare|Neon|Stripe|OAuth|JWKS|RLS)\b/i,
  /\b(?:billing|customer-data)\b/i,
];

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? files(child) : [child];
  }))).flat();
}

describe('local product boundary', () => {
  it('keeps shipped product surfaces free of retired hosted authority vocabulary', async () => {
    const paths = (await Promise.all(PRODUCT_SURFACES.map(async (path) => (
      path === 'src' || path === 'dist' ? files(path) : [path]
    )))).flat();

    for (const path of paths) {
      const content = await readFile(path, 'utf8');
      for (const pattern of RETIRED_PRODUCT_PATTERNS) {
        expect(content, `${path} contains ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('retains explicitly classified release and registry infrastructure', async () => {
    const releasing = await readFile('docs/releasing.md', 'utf8');
    expect(releasing).toContain('GitHub-hosted runner');
    expect(releasing).toContain('non-provider patterns');

    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      repository?: { url?: string };
      publishConfig?: { access?: string; registry?: string };
    };
    expect(manifest.repository?.url).toBe(
      'git+https://github.com/Byte-Ventures/borg-mcp-shared.git',
    );
    expect(manifest.publishConfig).toEqual({ access: 'public' });
  });
});
