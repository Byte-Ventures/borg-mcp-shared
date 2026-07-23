import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, lstat, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PACKED_BYTES = 512 * 1024;
const MAX_UNPACKED_BYTES = 1024 * 1024;
const MAX_FILES = 128;
const MAX_FILE_BYTES = 256 * 1024;
const REQUIRED_FILES = ['LICENSE', 'NOTICE', 'README.md', 'SECURITY.md', 'package.json'];
const EXPECTED_EXPORTS = {
  '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  './templates': { types: './dist/templates.d.ts', import: './dist/templates.js' },
  './role-section': { types: './dist/role-section.d.ts', import: './dist/role-section.js' },
  './log-stream-hwm': { types: './dist/log-stream-hwm.d.ts', import: './dist/log-stream-hwm.js' },
  './drone-address': { types: './dist/drone-address.d.ts', import: './dist/drone-address.js' },
  './runtime-metadata': { types: './dist/runtime-metadata.d.ts', import: './dist/runtime-metadata.js' },
  './protocol': { types: './dist/protocol/index.d.ts', import: './dist/protocol/index.js' },
  './domain': { types: './dist/domain/index.d.ts', import: './dist/domain/index.js' },
  './conformance': { types: './dist/conformance/index.d.ts', import: './dist/conformance/index.js' },
  './package.json': './package.json',
};
const ALLOWED_ROOTS = new Set([
  'CONTRIBUTING.md',
  'LICENSE',
  'NOTICE',
  'README.md',
  'SECURITY.md',
  'dist',
  'docs',
  'package.json',
  'src',
]);
const FORBIDDEN_HOOKS = [
  'preinstall',
  'install',
  'postinstall',
  'prepublish',
  'preprepare',
  'prepare',
  'postprepare',
  'dependencies',
  'postpack',
];
const FORBIDDEN_CONTENT = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, description: 'private key material' },
  { pattern: /\b(?:npm_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/, description: 'credential-shaped token' },
  { pattern: /\bpostgres(?:ql)?:\/\//i, description: 'database connection URL' },
  { pattern: /\bborgmcp\.ai\b/i, description: 'retired service domain' },
  { pattern: /\b(?:runEquivalentAdapterConformance|EquivalentAdapterConformanceReport)\b/, description: 'retired dual-authority conformance API' },
  { pattern: /\bcloud\b/i, description: 'retired product topology' },
  { pattern: /\b(?:Cloudflare|Neon|Stripe|OAuth|JWKS|RLS)\b/i, description: 'hosted authority terminology' },
  { pattern: /\b(?:billing|customer-data)\b/i, description: 'hosted account terminology' },
  { pattern: /\bkeychain\b/i, description: 'retired credential storage' },
  { pattern: /\b[a-z0-9-]+\.workers\.dev\b/i, description: 'Worker service URL' },
  { pattern: /(?:^|[^A-Za-z])(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/m, description: 'local absolute path' },
];

// GitHub-hosted build provenance, package registries, and secret-scanning
// provider classifications are release infrastructure, not product authority.

async function walk(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) throw new Error(`Packed artifact contains symlink: ${relative(root, absolute)}`);
    if (entry.isDirectory()) files.push(...await walk(root, absolute));
    else if (entry.isFile()) files.push(absolute);
    else throw new Error(`Packed artifact contains unsupported entry: ${relative(root, absolute)}`);
  }
  return files;
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function isPortableAbsolute(path) {
  return isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\');
}

export async function verifyPackedArtifact(tarballPath) {
  if (!tarballPath) throw new Error('Usage: npm run verify:artifact -- <package.tgz>');
  try {
    await access(resolve('.npmrc'));
    throw new Error('Repository-local .npmrc is forbidden for release builds.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const tarball = resolve(tarballPath);
  const packed = await readFile(tarball);
  if (packed.byteLength > MAX_PACKED_BYTES) {
    throw new Error(`Packed artifact is ${packed.byteLength} bytes; maximum is ${MAX_PACKED_BYTES}.`);
  }

  const entries = execFileSync('tar', ['-t', '-z', '-f', tarball], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (entries.length > MAX_FILES + 32 || new Set(entries).size !== entries.length) {
    throw new Error('Tar entry count exceeds policy or contains duplicate paths.');
  }
  for (const entry of entries) {
    if (!entry.startsWith('package/') || entry.includes('/../') || entry.startsWith('/')) {
      throw new Error(`Unsafe tar entry: ${entry}`);
    }
  }

  const temporary = await mkdtemp(join(tmpdir(), 'borgmcp-shared-pack-'));
  try {
    execFileSync('tar', ['-x', '-z', '-f', tarball, '-C', temporary], { stdio: 'pipe' });
    const root = join(temporary, 'package');
    const files = await walk(root);
    if (files.length > MAX_FILES) {
      throw new Error(`Packed artifact contains ${files.length} files; maximum is ${MAX_FILES}.`);
    }

    let unpackedBytes = 0;
    const relativeFiles = new Set();
    for (const file of files) {
      const path = relative(root, file).split(sep).join('/');
      const rootEntry = path.split('/')[0];
      if (!ALLOWED_ROOTS.has(rootEntry)) throw new Error(`Unexpected packed path: ${path}`);
      if (rootEntry === 'dist' && !/\.(?:js|d\.ts)(?:\.map)?$/.test(path)) {
        throw new Error(`Unexpected dist artifact: ${path}`);
      }
      if (rootEntry === 'src' && !path.endsWith('.ts')) throw new Error(`Unexpected source artifact: ${path}`);
      if (rootEntry === 'docs' && !path.endsWith('.md')) throw new Error(`Unexpected documentation artifact: ${path}`);
      if (/(^|\/)(\.env(?:\.|$)|\.npmrc$|node_modules|[^/]+\.(?:pem|key|p12|pfx))/.test(path)) {
        throw new Error(`Forbidden packed path: ${path}`);
      }
      const size = (await stat(file)).size;
      if (size > MAX_FILE_BYTES) throw new Error(`Packed file exceeds ${MAX_FILE_BYTES} bytes: ${path}`);
      const content = await readFile(file, 'utf8');
      for (const forbidden of FORBIDDEN_CONTENT) {
        if (forbidden.pattern.test(content)) {
          throw new Error(`Packed artifact contains ${forbidden.description}: ${path}`);
        }
      }
      unpackedBytes += size;
      relativeFiles.add(path);
    }
    if (unpackedBytes > MAX_UNPACKED_BYTES) {
      throw new Error(`Unpacked artifact is ${unpackedBytes} bytes; maximum is ${MAX_UNPACKED_BYTES}.`);
    }
    for (const required of REQUIRED_FILES) {
      if (!relativeFiles.has(required)) throw new Error(`Packed artifact is missing ${required}.`);
    }

    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (manifest.name !== 'borgmcp-shared' || manifest.version !== '0.6.0') {
      throw new Error(`Unexpected package identity: ${manifest.name}@${manifest.version}`);
    }
    if (manifest.repository?.url !== 'git+https://github.com/Byte-Ventures/borg-mcp-shared.git') {
      throw new Error('package.json repository must match the public provenance repository exactly.');
    }
    if (manifest.main !== './dist/index.js' || manifest.types !== './dist/index.d.ts' ||
        JSON.stringify(manifest.exports) !== JSON.stringify(EXPECTED_EXPORTS)) {
      throw new Error('Package entrypoints do not match the reviewed public exports.');
    }
    for (const value of Object.values(EXPECTED_EXPORTS)) {
      for (const target of typeof value === 'string' ? [value] : Object.values(value)) {
        if (!relativeFiles.has(target.slice(2))) {
          throw new Error(`Public export target is not shipped: ${target}`);
        }
      }
    }
    if (!manifest.publishConfig ||
        !sameValues(Object.keys(manifest.publishConfig), ['access']) ||
        manifest.publishConfig.access !== 'public') {
      throw new Error('publishConfig must contain only access=public; registry redirects are forbidden.');
    }
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies']) {
      if (manifest[field] && Object.keys(manifest[field]).length > 0) {
        throw new Error(`Runtime dependency field must remain empty: ${field}`);
      }
    }
    for (const hook of FORBIDDEN_HOOKS) {
      if (manifest.scripts?.[hook]) throw new Error(`Forbidden consumer lifecycle hook: ${hook}`);
    }

    const license = await readFile(join(root, 'LICENSE'));
    const licenseSha1 = createHash('sha1').update(license).digest('hex');
    if (licenseSha1 !== '7df059597099bb7dcf25d2a9aedfaf4465f72d8d') {
      throw new Error(`LICENSE is not canonical Apache-2.0 text: ${licenseSha1}`);
    }
    const notice = await readFile(join(root, 'NOTICE'), 'utf8');
    if (notice !== 'Borg MCP Shared\nCopyright 2026 Byte Ventures IO AB\n') {
      throw new Error('NOTICE does not match the approved product and legal entity.');
    }

    let sourceMapCount = 0;
    for (const path of relativeFiles) {
      if (!path.endsWith('.map')) continue;
      sourceMapCount += 1;
      const mapPath = join(root, ...path.split('/'));
      const sourceMap = JSON.parse(await readFile(mapPath, 'utf8'));
      if (!sourceMap || Array.isArray(sourceMap) || sourceMap.version !== 3) {
        throw new Error(`Source map must use the version 3 object format: ${path}`);
      }
      if (Object.hasOwn(sourceMap, 'sections')) {
        throw new Error(`Indexed source maps are forbidden: ${path}`);
      }
      if (sourceMap.sourcesContent !== undefined) {
        throw new Error(`Source map embeds sourcesContent: ${path}`);
      }
      if (!Array.isArray(sourceMap.sources) || sourceMap.sources.some((source) => (
        typeof source !== 'string' || source.length === 0
      ))) {
        throw new Error(`Source map sources must be non-empty strings: ${path}`);
      }
      if (sourceMap.sourceRoot !== undefined && (
        typeof sourceMap.sourceRoot !== 'string' ||
        isPortableAbsolute(sourceMap.sourceRoot) ||
        sourceMap.sourceRoot.includes('\\')
      )) {
        throw new Error(`Source map sourceRoot must be relative: ${path}`);
      }
      for (const source of sourceMap.sources) {
        if (isPortableAbsolute(source) || source.includes('\\')) {
          throw new Error(`Source map source must be relative: ${path} -> ${source}`);
        }
        const target = resolve(dirname(mapPath), sourceMap.sourceRoot ?? '', source);
        if (!isInside(root, target) || !relativeFiles.has(relative(root, target).split(sep).join('/'))) {
          throw new Error(`Source map target is not shipped: ${path} -> ${source}`);
        }
      }
    }
    if (sourceMapCount === 0) throw new Error('Packed artifact unexpectedly contains no source maps.');

    return {
      name: manifest.name,
      version: manifest.version,
      fileCount: files.length,
      packedBytes: packed.byteLength,
      unpackedBytes,
      sourceMapCount,
      integrity: `sha512-${createHash('sha512').update(packed).digest('base64')}`,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function sameValues(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const report = await verifyPackedArtifact(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
}
