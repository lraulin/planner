/**
 * Read-only agent tools over Scenarios. Both go through `loadScenarioWorkspace` — the page's
 * own loader — so the remainder an agent quotes is the number the page shows. There are no
 * write tools: a scenario is edited by the person who is deciding what to do with the month.
 */

import type {
  ScenarioDetail,
  ScenarioSummary,
} from "@/lib/finances/scenarios/workspace";
import {
  loadScenarioDetail,
  loadScenarioSummaries,
} from "@/lib/finances/scenarios/workspace";
import { flattenLines } from "@/lib/finances/scenarios/compose";
import { AgentError } from "./errors";
import { optionalNumber, requireString } from "./parse";
import { pageBounds, paginate } from "./pagination";

export function scenarioSummaryRow(summary: ScenarioSummary) {
  return {
    id: summary.id,
    name: summary.name,
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    remainderCents: summary.remainderCents,
    incomplete: summary.incomplete,
  };
}

const SOURCE_NAMES = {
  manual: "manual",
  supplyItem: "supply_item",
  supplyGroup: "supply_group",
  none: "none",
} as const;

/**
 * One scenario as rows an agent can read: what counts, what is switched off, and what the
 * lines add up to. Compact on purpose — a scenario with every bill and a few dozen lines has
 * to stay inside the connector gateway's budget (`responseBudget.test.ts`).
 */
export function scenarioDetailResponse(detail: ScenarioDetail) {
  const { composition } = detail;
  const lines = flattenLines([...composition.incomeLines, ...composition.expenseLines]);
  return {
    scenario: {
      id: detail.scenario.id,
      name: detail.scenario.name,
      notes: detail.scenario.notes,
    },
    totals: {
      incomeCents: composition.incomeCents,
      billsCents: composition.billsCents,
      linesCents: composition.linesCents,
      expenseCents: composition.expenseCents,
      remainderCents: composition.remainderCents,
      incomplete: composition.incomplete,
      incompleteNames: composition.incompleteNames,
    },
    income: composition.incomeRows.map((row) => ({
      envelopeId: row.envelopeId,
      name: row.name,
      included: row.included,
      monthlyCents: row.monthlyCents,
      overridden: row.overridden,
    })),
    bills: composition.billRows.map((row) => ({
      envelopeId: row.envelopeId,
      name: row.name,
      group: row.groupLabel,
      status: row.status,
      included: row.included,
      monthlyCents: row.monthlyCents,
      overridden: row.overridden,
      actualMonthlyCents: row.actualMonthlyCents,
    })),
    lines: lines.map((line) => ({
      id: line.id,
      parentId: line.parentId,
      name: line.name,
      kind: line.kind,
      rollup: line.isRollup,
      source: line.isRollup ? "none" : SOURCE_NAMES[line.source.type],
      monthlyCents: line.monthlyCents,
      actualMonthlyCents: line.actualMonthlyCents,
    })),
    uncovered: detail.uncovered.map((row) => ({
      envelopeId: row.envelopeId,
      name: row.name,
      monthlyCents: row.monthlyCents,
    })),
    actualMonths: detail.actualMonths,
  };
}

export async function listScenariosTool(userId: string, args: Record<string, unknown>) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const summaries = await loadScenarioSummaries(userId);
  const page = paginate(summaries.map(scenarioSummaryRow), bounds);
  return { scenarios: page.items, pageInfo: page.pageInfo };
}

export async function getScenarioTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await loadScenarioDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Scenario not found: ${id}`);
  return scenarioDetailResponse(detail);
}
