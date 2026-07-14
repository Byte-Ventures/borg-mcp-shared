import { describe, expect, it } from 'vitest';
import {
  ADAPTER_CONFORMANCE_FIXTURES,
  runAdapterConformance,
  type AdapterConformanceDriver,
  type AdapterConformanceObservation,
} from '../src/index.js';

class FixtureDriver implements AdapterConformanceDriver {
  constructor(private readonly override: Partial<Record<string, AdapterConformanceObservation>> = {}) {}

  async observe(fixture: (typeof ADAPTER_CONFORMANCE_FIXTURES)[number]) {
    return this.override[fixture.id] ?? fixture.expected;
  }
}

describe('adapter-level conformance', () => {
  it('exports executable cases spanning the required contract areas', () => {
    const areas = new Set(ADAPTER_CONFORMANCE_FIXTURES.map((fixture) => fixture.area));
    expect(areas).toEqual(
      new Set([
        'http',
        'errors',
        'security',
        'sse',
        'cursor',
        'acks',
        'claims',
        'decisions',
        'capabilities',
      ]),
    );
  });

  it('runs without a test-framework dependency', async () => {
    const report = await runAdapterConformance(new FixtureDriver());
    expect(report.ok).toBe(true);
    expect(report.results).toHaveLength(ADAPTER_CONFORMANCE_FIXTURES.length);
  });

  it('reports a precise failing case', async () => {
    const report = await runAdapterConformance(
      new FixtureDriver({
        'http.unauthenticated-liveness': { status: 200, body: '{"version":"1"}' },
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        id: 'http.unauthenticated-liveness',
        ok: false,
      }),
    );
  });
});
