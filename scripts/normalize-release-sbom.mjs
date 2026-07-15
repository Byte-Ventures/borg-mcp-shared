import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: normalize-release-sbom.mjs <raw-cyclonedx-json> <output-json>');
}

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const sbom = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const root = sbom.metadata?.component;
const expectedRef = `${manifest.name}@${manifest.version}`;
if (root?.['bom-ref'] !== expectedRef || root.version !== manifest.version ||
    root.purl !== `pkg:npm/${manifest.name}@${manifest.version}`) {
  throw new Error('Raw CycloneDX root identity does not match package.json.');
}

// npm derives this display-only field from the checkout directory basename.
root.name = manifest.name;
await writeFile(resolve(outputPath), `${JSON.stringify(sbom, null, 2)}\n`, { flag: 'wx' });
