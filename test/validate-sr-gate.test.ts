import { describe, expect, it } from 'vitest';
import {
  validateSha512,
  validatePositiveInt,
  validateSourceRun,
  validateArtifactContents,
  validateTarballHash,
  validateRunEvidence,
} from '../scripts/validate-sr-gate.mjs';

describe('SR artifact-tuple gate', () => {
  describe('validateSha512', () => {
    it.each([
      ['', 'empty'],
      ['g'.repeat(128), 'contains non-hex characters'],
      ['a'.repeat(127), 'length 127, expected 128'],
      ['a'.repeat(129), 'length 129, expected 128'],
    ])('rejects %s as %s', (input, expected) => {
      expect(validateSha512(input)).toContain(expected);
    });

    it('accepts a valid 128-character lowercase hex string', () => {
      expect(validateSha512('a'.repeat(128))).toBeNull();
      expect(validateSha512('0123456789abcdef'.repeat(8))).toBeNull();
    });
  });

  describe('validatePositiveInt', () => {
    it.each([
      ['', 'is empty'],
      ['0', 'not a positive integer'],
      ['-1', 'not a positive integer'],
      ['abc', 'not a positive integer'],
      ['1.5', 'not a positive integer'],
      ['01', 'not a positive integer'],
    ])('rejects %s: %s', (input, expected) => {
      expect(validatePositiveInt('test', input)).toContain(expected);
    });

    it('accepts valid positive integers', () => {
      expect(validatePositiveInt('run_id', '1')).toBeNull();
      expect(validatePositiveInt('run_id', '42')).toBeNull();
      expect(validatePositiveInt('run_id', '999999')).toBeNull();
    });
  });

  describe('validateSourceRun', () => {
    const validRun = {
      path: '.github/workflows/publish.yml',
      event: 'push',
      head_branch: 'v0.4.1',
      head_sha: 'abc123',
      conclusion: 'success',
      run_attempt: 1,
    };

    it('accepts a valid source run', () => {
      expect(validateSourceRun(validRun, '.github/workflows/publish.yml', 'push', 'v0.4.1', 'abc123', 1)).toBeNull();
    });

    it.each([
      [{ ...validRun, path: '.github/workflows/ci.yml' }, 'workflow path'],
      [{ ...validRun, event: 'workflow_dispatch' }, 'event'],
      [{ ...validRun, head_branch: 'refs/tags/v0.4.1' }, 'head_branch'],
      [{ ...validRun, head_branch: 'main' }, 'head_branch'],
      [{ ...validRun, head_sha: 'def456' }, 'head_sha'],
      [{ ...validRun, conclusion: 'failure' }, 'conclusion'],
      [{ ...validRun, conclusion: null }, 'conclusion'],
      [{ ...validRun, run_attempt: 2 }, 'run_attempt'],
    ])('rejects mismatched field: %j', (run, expectedField) => {
      const error = validateSourceRun(run, '.github/workflows/publish.yml', 'push', 'v0.4.1', 'abc123', 1);
      expect(error).not.toBeNull();
      expect(error).toContain(expectedField);
    });
  });

  describe('validateArtifactContents', () => {
    it('accepts valid artifact contents', () => {
      const files = [
        'borgmcp-shared-0.4.1.tgz',
        'SHA512SUMS',
        'RUN_EVIDENCE',
        'artifact-report.json',
        'borgmcp-shared-0.4.1.cdx.json',
        'sbom-report.json',
      ];
      expect(validateArtifactContents(files, 'borgmcp-shared-0.4.1.tgz')).toBeNull();
    });

    it('rejects missing tarball', () => {
      expect(validateArtifactContents(['SHA512SUMS'], 'borgmcp-shared-0.4.1.tgz')).toContain('tarball');
    });

    it('rejects unexpected entries', () => {
      const files = [
        'borgmcp-shared-0.4.1.tgz',
        'SHA512SUMS',
        'RUN_EVIDENCE',
        'artifact-report.json',
        'borgmcp-shared-0.4.1.cdx.json',
        'sbom-report.json',
        'unexpected-file.txt',
      ];
      const error = validateArtifactContents(files, 'borgmcp-shared-0.4.1.tgz');
      expect(error).toContain('unexpected');
      expect(error).toContain('unexpected-file.txt');
    });
  });

  describe('validateTarballHash', () => {
    it('accepts matching hash', () => {
      expect(validateTarballHash('abc', 'abc')).toBeNull();
    });

    it('rejects mismatched hash', () => {
      const error = validateTarballHash('aaa', 'bbb');
      expect(error).toContain('SHA-512 mismatch');
      expect(error).toContain('aaa');
      expect(error).toContain('bbb');
    });
  });

  describe('validateRunEvidence', () => {
    it('accepts valid evidence', () => {
      const evidence = 'run_id=12345\nrun_attempt=1\n';
      expect(validateRunEvidence(evidence, '12345', '1')).toBeNull();
    });

    it('rejects missing evidence', () => {
      expect(validateRunEvidence('', '1', '1')).toContain('missing');
    });

    it('rejects mismatched run_id', () => {
      const evidence = 'run_id=99999\nrun_attempt=1\n';
      const error = validateRunEvidence(evidence, '12345', '1');
      expect(error).toContain('run_id');
      expect(error).toContain('99999');
    });

    it('rejects mismatched run_attempt', () => {
      const evidence = 'run_id=12345\nrun_attempt=3\n';
      const error = validateRunEvidence(evidence, '12345', '1');
      expect(error).toContain('run_attempt');
      expect(error).toContain('3');
    });

    it('rejects evidence missing run_id field', () => {
      const evidence = 'run_attempt=1\n';
      expect(validateRunEvidence(evidence, '1', '1')).toContain('run_id not found');
    });

    it('rejects evidence missing run_attempt field', () => {
      const evidence = 'run_id=1\n';
      expect(validateRunEvidence(evidence, '1', '1')).toContain('run_attempt not found');
    });
  });
});
