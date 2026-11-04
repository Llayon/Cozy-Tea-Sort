/**
 * G23 DEV preflight — Ordered Layered Infusion on the frozen production
 * topology (4 TeaIds × 4 units, 6 vessels, 5 ordinary cap-4 cups + one
 * empty special cup).
 *
 * IMPORTANT: this is a diagnostic probe, not the 2000-board feasibility
 * experiment. The frozen profile is arithmetically unwinnable:
 *   total tea = 16, recipe holds k ∈ {2,3}, ordinary tea = 16-k ∈ {14,13},
 *   every ordinary cup must end empty or full homogeneous cap-4, so the
 *   ordinary total must be divisible by 4. Neither 14 nor 13 is. The probe
 *   confirms that production-seeded boards and the real solver agree.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateLevel, type GenerateRequest } from '../../src/game/logic/generator.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import {
  cloneCupConstraint,
  type CupConstraint,
  type TeaId,
} from '../../src/game/types.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const REQUEST: GenerateRequest = {
  numColors: 4,
  colors: PALETTE,
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'peak',
};

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] as string) : fallback;
}

const COUNT = Math.max(1, Math.floor(Number(argValue('--count', '100'))));
const OUT = resolve(
  dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  'out',
  `g23-layered-infusion-preflight-${COUNT}.json`,
);

function permutations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const walk = (prefix: T[], rest: readonly T[]): void => {
    if (prefix.length === k) {
      out.push([...prefix]);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      walk([...prefix, rest[i] as T], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  walk([], items);
  return out;
}

const PAIRS = permutations(PALETTE, 2);
const TRIPLES = permutations(PALETTE, 3);

function baseRequest(): GenerateRequest {
  return { ...REQUEST, colors: [...PALETTE] };
}

function specialConstraint(recipe: readonly TeaId[]): CupConstraint {
  return { mode: 'normal', capacity: recipe.length, layerRecipe: [...recipe] };
}

function reverseRecipe(recipe: readonly TeaId[]): TeaId[] {
  return [...recipe].reverse();
}

interface SolveRecord {
  solvable: boolean;
  minMoves?: number;
  visitedStates: number;
  truncated: boolean;
  ms: number;
}

function solve(cups: TeaId[][], constraints: readonly CupConstraint[]): SolveRecord {
  const started = performance.now();
  const result = solvePuzzle(cups.map((cup) => [...cup]), {
    cupConstraints: constraints,
    maxVisited: 200_000,
    maxDepth: 60,
  });
  return {
    solvable: result.solvable,
    minMoves: result.minMoves,
    visitedStates: result.visitedStates,
    truncated: result.truncated === true,
    ms: Number((performance.now() - started).toFixed(3)),
  };
}

interface RecordRow {
  index: number;
  seed: string;
  profile: 'L2' | 'L3';
  recipe: TeaId[];
  reverseRecipe: TeaId[];
  specialIndex: number;
  recipeLength: number;
  canonicalKey: string;
  baseMinMoves: number;
  baseVisitedStates: number;
  baseLengths: number[];
  teaTotal: number;
  ordinaryTeaAfterRecipe: number;
  ordinaryTeaMod4: number;
  arithmeticSolvable: boolean;
  forward: SolveRecord;
  reverse: SolveRecord;
}

const rows: RecordRow[] = [];
const baseCache = new Map<string, ReturnType<typeof generateLevel>>();
const startedAll = performance.now();

for (let i = 0; i < COUNT; i++) {
  const seed = `g23-layered-infusion:${i}`;
  let base = baseCache.get(seed);
  if (!base) {
    base = generateLevel(baseRequest(), seed);
    baseCache.set(seed, base);
  }
  const emptyIndices = base.cups
    .map((cup, idx) => (cup.length === 0 ? idx : -1))
    .filter((idx) => idx >= 0);
  if (emptyIndices.length !== 2) {
    throw new Error(`seed ${seed}: expected exactly two empty cups, got ${emptyIndices.length}`);
  }
  const totalTea = base.cups.reduce((sum, cup) => sum + cup.length, 0);
  if (totalTea !== 16) throw new Error(`seed ${seed}: expected 16 tea units, got ${totalTea}`);

  for (const profile of ['L2', 'L3'] as const) {
    const recipe = profile === 'L2' ? PAIRS[i % PAIRS.length] : TRIPLES[i % TRIPLES.length];
    if (!recipe) throw new Error('missing recipe permutation');
    const specialIndex = emptyIndices[i % emptyIndices.length] as number;
    const constraints = base.cupConstraints.map((c) => cloneCupConstraint(c));
    constraints[specialIndex] = specialConstraint(recipe);
    const reverse = reverseRecipe(recipe);
    const reverseConstraints = constraints.map((c) => cloneCupConstraint(c));
    reverseConstraints[specialIndex] = specialConstraint(reverse);

    const ordinaryTeaAfterRecipe = totalTea - recipe.length;
    rows.push({
      index: i,
      seed,
      profile,
      recipe: [...recipe],
      reverseRecipe: reverse,
      specialIndex,
      recipeLength: recipe.length,
      canonicalKey: canonicalPuzzleKey(
        { cups: base.cups, floatingIngredients: base.floatingIngredients },
        constraints,
      ),
      baseMinMoves: base.minMoves,
      baseVisitedStates: base.visitedStates,
      baseLengths: base.cups.map((cup) => cup.length),
      teaTotal: totalTea,
      ordinaryTeaAfterRecipe,
      ordinaryTeaMod4: ordinaryTeaAfterRecipe % 4,
      arithmeticSolvable: ordinaryTeaAfterRecipe % 4 === 0,
      forward: solve(base.cups, constraints),
      reverse: solve(base.cups, reverseConstraints),
    });
  }
  if ((i + 1) % 10 === 0 || i + 1 === COUNT) {
    process.stderr.write(`g23 preflight: ${i + 1}/${COUNT} seeds\n`);
  }
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[at] as number;
}

function stats(values: readonly number[]) {
  return {
    p50: Number(percentile(values, 50).toFixed(3)),
    p95: Number(percentile(values, 95).toFixed(3)),
    max: Number((values.length > 0 ? Math.max(...values) : 0).toFixed(3)),
  };
}

function summarize(profile: 'L2' | 'L3') {
  const subset = rows.filter((row) => row.profile === profile);
  const forwardSolvable = subset.filter((row) => row.forward.solvable).length;
  const forwardTruncated = subset.filter((row) => row.forward.truncated).length;
  const reverseSolvable = subset.filter((row) => row.reverse.solvable).length;
  const reverseTruncated = subset.filter((row) => row.reverse.truncated).length;
  const arithmeticSolvable = subset.filter((row) => row.arithmeticSolvable).length;
  const positionHistogram: Record<string, number> = {};
  const recipeHistogram: Record<string, number> = {};
  const baseDepthHistogram: Record<string, number> = {};
  for (const row of subset) {
    positionHistogram[String(row.specialIndex)] =
      (positionHistogram[String(row.specialIndex)] ?? 0) + 1;
    const key = row.recipe.join('>');
    recipeHistogram[key] = (recipeHistogram[key] ?? 0) + 1;
    baseDepthHistogram[String(row.baseMinMoves)] =
      (baseDepthHistogram[String(row.baseMinMoves)] ?? 0) + 1;
  }
  const uniqueCanonical = new Set(subset.map((row) => row.canonicalKey)).size;
  const first200 = subset.slice(0, Math.min(200, subset.length));
  return {
    profile,
    sampleCount: subset.length,
    distinctSeeds: new Set(subset.map((row) => row.seed)).size,
    solvable: forwardSolvable,
    unsolvable: subset.length - forwardSolvable,
    truncated: forwardTruncated,
    arithmeticSolvable,
    canonicalUniqueStarts: uniqueCanonical,
    canonicalVariety200:
      first200.length === 0
        ? 0
        : Number((new Set(first200.map((row) => row.canonicalKey)).size / first200.length).toFixed(4)),
    baseDepthHistogram,
    baseMinMoves: stats(subset.map((row) => row.baseMinMoves)),
    solverMs: stats(subset.map((row) => row.forward.ms)),
    visitedStates: stats(subset.map((row) => row.forward.visitedStates)),
    reverseSolvable,
    reverseUnsolvable: subset.length - reverseSolvable,
    reverseTruncated,
    reverseSolverMs: stats(subset.map((row) => row.reverse.ms)),
    reverseVisitedStates: stats(subset.map((row) => row.reverse.visitedStates)),
    specialPositionHistogram: positionHistogram,
    recipeHistogram,
    baseLengthHistogram: subset.reduce<Record<string, number>>((acc, row) => {
      const key = row.baseLengths.join(',');
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

const payload = {
  gauntlet: 'G23',
  kind: 'layered-infusion-preflight',
  sourceBaseline: '428755b6ba4a3dc6ec7cca87b3cbeb2b8d1a13c6',
  generatedAt: new Date().toISOString(),
  seedFamily: 'g23-layered-infusion:<index>',
  request: baseRequest(),
  countPerProfile: COUNT,
  elapsedMs: Number((performance.now() - startedAll).toFixed(3)),
  arithmeticProof: {
    teaUnitsPerColor: 4,
    teaColors: 4,
    totalTea: 16,
    l2RecipeLayers: 2,
    l3RecipeLayers: 3,
    ordinaryTeaAfterL2: 14,
    ordinaryTeaAfterL3: 13,
    ordinaryCupEndState: 'empty or full homogeneous capacity 4',
    requiredOrdinaryTotalMultipleOf: 4,
    l2Remainder: 14 % 4,
    l3Remainder: 13 % 4,
    conclusion: 'no board in the frozen topology can satisfy both the special recipe and ordinary cup completion',
  },
  profiles: [summarize('L2'), summarize('L3')],
  rows,
  payloadSha256: '',
};
payload.payloadSha256 = createHash('sha256').update(JSON.stringify({ ...payload, payloadSha256: '' })).digest('hex');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
process.stdout.write(`${OUT}\n`);
