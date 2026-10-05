import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeScenarioLines,
  financeScenarioOverrides,
  financeScenarios,
} from "@/db/schema";
import { lineSourceOf } from "./amount";
import type { ScenarioLineInput, ScenarioOverrideInput } from "./compose";

/**
 * What a scenario stores — its own rows, with nothing from the budget laid over them.
 * `workspace.ts` composes these with the live bills, income and Supplies.
 *
 * Every read is scoped by `userId`, and a scenario id that is not the caller's is
 * indistinguishable from one that does not exist: `loadScenario` returns `null` for both.
 */
export type ScenarioRecord = {
  id: string;
  name: string;
  notes: string;
  sortKey: string;
};

export type ScenarioRecords = {
  scenario: ScenarioRecord;
  lines: ScenarioLineInput[];
  overrides: ScenarioOverrideInput[];
};

const scenarioColumns = {
  id: financeScenarios.id,
  name: financeScenarios.name,
  notes: financeScenarios.notes,
  sortKey: financeScenarios.sortKey,
};

function lineOf(row: typeof financeScenarioLines.$inferSelect): ScenarioLineInput {
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind,
    sortKey: row.sortKey,
    name: row.name,
    source: lineSourceOf(row),
    envelopeId: row.envelopeId,
    budgetGroupId: row.budgetGroupId,
  };
}

export async function listScenarios(userId: string): Promise<ScenarioRecord[]> {
  return db
    .select(scenarioColumns)
    .from(financeScenarios)
    .where(eq(financeScenarios.userId, userId))
    .orderBy(asc(financeScenarios.sortKey), asc(financeScenarios.createdAt));
}

/** One scenario with its lines and overrides, or null when it is not the caller's. */
export async function loadScenario(
  userId: string,
  scenarioId: string,
): Promise<ScenarioRecords | null> {
  const [scenario] = await db
    .select(scenarioColumns)
    .from(financeScenarios)
    .where(
      and(eq(financeScenarios.userId, userId), eq(financeScenarios.id, scenarioId)),
    )
    .limit(1);
  if (!scenario) return null;

  const [lines, overrides] = await Promise.all([
    db
      .select()
      .from(financeScenarioLines)
      .where(
        and(
          eq(financeScenarioLines.userId, userId),
          eq(financeScenarioLines.scenarioId, scenarioId),
        ),
      ),
    db
      .select()
      .from(financeScenarioOverrides)
      .where(
        and(
          eq(financeScenarioOverrides.userId, userId),
          eq(financeScenarioOverrides.scenarioId, scenarioId),
        ),
      ),
  ]);
  return {
    scenario,
    lines: lines.map(lineOf),
    overrides: overrides.map(overrideOf),
  };
}

function overrideOf(
  row: typeof financeScenarioOverrides.$inferSelect,
): ScenarioOverrideInput {
  return {
    envelopeId: row.envelopeId,
    included: row.included,
    monthlyCents: row.monthlyCents,
  };
}

/** Every scenario with its lines and overrides, in three reads — for the picker's remainders. */
export async function loadAllScenarios(userId: string): Promise<ScenarioRecords[]> {
  const [scenarios, lines, overrides] = await Promise.all([
    listScenarios(userId),
    db
      .select()
      .from(financeScenarioLines)
      .where(eq(financeScenarioLines.userId, userId)),
    db
      .select()
      .from(financeScenarioOverrides)
      .where(eq(financeScenarioOverrides.userId, userId)),
  ]);
  return scenarios.map((scenario) => ({
    scenario,
    lines: lines.filter((line) => line.scenarioId === scenario.id).map(lineOf),
    overrides: overrides
      .filter((override) => override.scenarioId === scenario.id)
      .map(overrideOf),
  }));
}
