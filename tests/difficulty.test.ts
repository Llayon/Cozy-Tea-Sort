import { describe, expect, it } from 'vitest';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';
import {
  SOLVER_DEPTH_ACCEPTANCE,
  SOLVER_DEPTH_TARGETS,
  depthAccepted,
} from '../src/game/logic/difficulty';

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function sampleDepths(req: GenerateRequest, n: number, prefix: string): number[] {
  const out: number[] = [];
  for (let s = 0; s < n; s++) {
    out.push(generateLevel(req, `${prefix}:${s}`).minMoves);
  }
  return out;
}

const WARMUP: GenerateRequest = {
  numColors: 3,
  colors: ['matcha', 'sea_buckthorn', 'karkade'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'warmup',
};
const CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
};
const PEAK: GenerateRequest = {
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
};
const RELAX: GenerateRequest = {
  numColors: 3,
  colors: ['saffron', 'matcha', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'relax',
};

describe('difficulty rhythm ("Breathing")', () => {
  it('target bands preserve the breathing shape: peak > warmup, peak > relax', () => {
    expect(SOLVER_DEPTH_TARGETS.peak.min).toBeGreaterThan(SOLVER_DEPTH_TARGETS.warmup.max);
    expect(SOLVER_DEPTH_TARGETS.peak.min).toBeGreaterThan(SOLVER_DEPTH_TARGETS.relax.max);
    expect(SOLVER_DEPTH_TARGETS.challenge.min).toBeGreaterThanOrEqual(
      SOLVER_DEPTH_TARGETS.warmup.min,
    );
    // Relax genuinely releases: same band as warmup, far below peak.
    expect(SOLVER_DEPTH_ACCEPTANCE.relax).toEqual(SOLVER_DEPTH_ACCEPTANCE.warmup);
  });

  it('generated medians follow focus-rise then release (seeded)', () => {
    const warm = sampleDepths(WARMUP, 25, 'diff:warmup');
    const chal = sampleDepths(CHALLENGE, 25, 'diff:challenge');
    const peak = sampleDepths(PEAK, 25, 'diff:peak');
    const relax = sampleDepths(RELAX, 25, 'diff:relax');

    expect(median(chal)).toBeGreaterThanOrEqual(median(warm));
    expect(median(peak)).toBeGreaterThan(median(warm));
    expect(median(peak)).toBeGreaterThan(median(relax));
    expect(median(relax)).toBeLessThanOrEqual(median(peak));
  });

  it('most generated levels land inside the robust acceptance bands', () => {
    const cases: Array<{ req: GenerateRequest; prefix: string }> = [
      { req: WARMUP, prefix: 'acc:warmup' },
      { req: CHALLENGE, prefix: 'acc:challenge' },
      { req: PEAK, prefix: 'acc:peak' },
      { req: RELAX, prefix: 'acc:relax' },
    ];
    for (const { req, prefix } of cases) {
      const depths = sampleDepths(req, 25, prefix);
      const accepted = depths.filter((d) => depthAccepted(d, req.phase)).length;
      // Generator enforces acceptance with a closest-to-target fallback,
      // so the large majority must be inside the band.
      expect(accepted).toBeGreaterThanOrEqual(20);
    }
  });
});
