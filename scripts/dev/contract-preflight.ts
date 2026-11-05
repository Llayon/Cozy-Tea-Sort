#!/usr/bin/env bunx tsx
/**
 * G24 DEV-ONLY CLI.
 *
 * Usage:
 *   bunx tsx scripts/dev/contract-preflight.ts
 *   bunx tsx scripts/dev/contract-preflight.ts tea-pair
 *   bunx tsx scripts/dev/contract-preflight.ts g23-layered-l2 --json
 *   bunx tsx scripts/dev/contract-preflight.ts --list
 *   bunx tsx scripts/dev/contract-preflight.ts --bench
 *
 * This CLI never touches production gameplay. It is a mathematical preflight
 * for terminal tea allocation, not a puzzle solver.
 */

import {
  CONTRACT_PREFLIGHT_SCENARIOS,
  scenarioByName,
  type ContractPreflightScenario,
} from './lib/contract-preflight-scenarios';
import {
  analyzeTerminalAllocation,
  type TeaAmounts,
  type TerminalAllocationAssignment,
  type TerminalAllocationResult,
} from '../../src/game/logic/contractPreflight';
import type { TeaId } from '../../src/game/types';

// Keep this dev CLI typecheckable under the app tsconfig without widening the
// production global type surface with @types/node.
declare const process: { argv: readonly string[]; exitCode?: number };

interface CliOptions {
  readonly names: readonly string[];
  readonly json: boolean;
  readonly list: boolean;
  readonly bench: boolean;
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const names: string[] = [];
  let json = false;
  let list = false;
  let bench = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg === '--list') list = true;
    else if (arg === '--bench') bench = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option '${arg}'`);
    else names.push(arg);
  }
  return { names, json, list, bench, help };
}

function letterFor(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

function formatAmounts(amounts: TeaAmounts, teaIds: readonly TeaId[]): string {
  const parts: string[] = [];
  teaIds.forEach((tea, idx) => {
    const value = amounts[tea] ?? 0;
    if (value !== 0) parts.push(`${letterFor(idx)}${value}`);
  });
  return parts.length === 0 ? '(empty)' : parts.join(' ');
}

function formatLegend(teaIds: readonly TeaId[]): string {
  return teaIds.map((tea, idx) => `${letterFor(idx)}=${tea}`).join(' ');
}

function formatAssignment(
  assignment: TerminalAllocationAssignment,
  teaIds: readonly TeaId[],
): string {
  const name = assignment.unitLabel ?? assignment.unitId;
  const memberText = assignment.members && assignment.members.length > 1
    ? ` [${assignment.members.join(', ')}]`
    : '';
  return `${name}${memberText} -> ${formatAmounts(assignment.amounts, teaIds)}` +
    (assignment.optionLabel !== undefined ? `  (${assignment.optionLabel})` : '');
}

function printHuman(
  scenario: ContractPreflightScenario,
  result: TerminalAllocationResult,
  elapsedMs: number,
): void {
  const { problem } = scenario;
  console.log(`Scenario: ${scenario.name}`);
  console.log(`Description: ${scenario.description}`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Tea IDs: ${formatLegend(problem.teaIds)}`);
  console.log(`Inventory: ${formatAmounts(result.diagnostic.inventory, problem.teaIds)}`);

  const fixed = result.diagnostic.fixedConsumption;
  if (Object.values(fixed).some((value) => (value ?? 0) !== 0)) {
    console.log(`Fixed/special final: ${formatAmounts(fixed, problem.teaIds)}`);
  }

  if (result.verdict === 'AlgebraicUnsat') {
    console.log(`Residual: ${formatAmounts(result.diagnostic.residual, problem.teaIds)}`);
    console.log(`Reason: ${result.reason ?? '(no reason)'}`);
    if (result.diagnostic.frontierResidual !== undefined) {
      console.log(
        `Frontier: unit ${String(result.diagnostic.frontierUnitIndex)} -> ` +
        `${formatAmounts(result.diagnostic.frontierResidual, problem.teaIds)}`,
      );
    }
  } else if (result.verdict === 'AlgebraicallyFeasible') {
    console.log('Witness:');
    for (const assignment of result.witness?.assignments ?? []) {
      console.log(`  ${formatAssignment(assignment, problem.teaIds)}`);
    }
  } else {
    console.log(`Unsupported: ${result.unsupportedReason ?? result.reason ?? '(no reason)'}`);
  }

  console.log(`Explored states: ${result.exploredStates}`);
  console.log(`Elapsed: ${elapsedMs.toFixed(3)} ms`);
  console.log('');
}

function runScenario(name: string): {
  scenario: ContractPreflightScenario;
  result: TerminalAllocationResult;
  elapsedMs: number;
} {
  const scenario = scenarioByName(name);
  if (!scenario) throw new Error(`unknown scenario '${name}'`);
  const started = performance.now();
  const result = analyzeTerminalAllocation(scenario.problem);
  const elapsedMs = performance.now() - started;
  return { scenario, result, elapsedMs };
}

function matchesExpectation(
  scenario: ContractPreflightScenario,
  result: TerminalAllocationResult,
): boolean {
  if (result.verdict !== scenario.expectedVerdict) return false;
  if (!scenario.expectedReasonIncludes) return true;
  const reason = `${result.reason ?? ''} ${result.unsupportedReason ?? ''}`;
  return scenario.expectedReasonIncludes.every((needle) => reason.includes(needle));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(
      [
        'G24 contract/conservation preflight (DEV ONLY)',
        '',
        'Usage: bunx tsx scripts/dev/contract-preflight.ts [scenario] [--json] [--list] [--bench]',
        '',
        'Scenarios:',
        ...CONTRACT_PREFLIGHT_SCENARIOS.map((scenario) => `  ${scenario.name.padEnd(36)} ${scenario.expectedVerdict}`),
      ].join('\n'),
    );
    return;
  }

  if (options.list) {
    for (const scenario of CONTRACT_PREFLIGHT_SCENARIOS) {
      console.log(`${scenario.name}\t${scenario.expectedVerdict}\t${scenario.description}`);
    }
    return;
  }

  const names = options.names.length > 0
    ? options.names
    : CONTRACT_PREFLIGHT_SCENARIOS.map((scenario) => scenario.name);

  const runs = names.map(runScenario);
  const failures = runs.filter(({ scenario, result }) => !matchesExpectation(scenario, result));

  if (options.json) {
    const payload = runs.map(({ scenario, result, elapsedMs }) => ({
      scenario: scenario.name,
      description: scenario.description,
      expectedVerdict: scenario.expectedVerdict,
      matchesExpectation: matchesExpectation(scenario, result),
      elapsedMs,
      result,
    }));
    console.log(JSON.stringify(options.names.length === 1 ? payload[0] : payload, null, 2));
  } else {
    for (const run of runs) {
      printHuman(run.scenario, run.result, run.elapsedMs);
    }
  }

  if (options.bench) {
    const times = runs.map((run) => run.elapsedMs);
    const max = Math.max(...times);
    const total = times.reduce((sum, value) => sum + value, 0);
    console.log(`Benchmark: ${runs.length} scenarios, total ${total.toFixed(3)} ms, max ${max.toFixed(3)} ms`);
    console.log(`Max explored states: ${Math.max(...runs.map((run) => run.result.exploredStates))}`);
  }

  if (failures.length > 0) {
    console.error(`Expectation failures: ${failures.map(({ scenario }) => scenario.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main();
