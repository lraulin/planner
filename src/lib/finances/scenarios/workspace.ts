import type { SupplyItemRow } from "../supplies/queries";
import { listSupplyItems } from "../supplies/queries";
import { loadInsightsRows, loadRecurringBills } from "../dashboardQueries";
import { billGroupLabel } from "../billsView";
import { billRows } from "../commitmentRows";
import {
  listBudgetStructure,
  type BudgetCategoryRow,
  type BudgetGroupRow,
} from "../budget/queries";
import { localDateKey } from "@/lib/schedule/geometry";
import {
  averageOver,
  groupAverage,
  spendingActuals,
  type SpendingActuals,
} from "./actuals";
import {
  composeScenario,
  flattenLines,
  type ComposeInput,
  type ScenarioBillInput,
  type ScenarioComposition,
  type ScenarioIncomeInput,
} from "./compose";
import { addSeedLines } from "./mutations";
import { loadAllScenarios, loadScenario, type ScenarioRecords } from "./queries";
import { seedLines } from "./seed";
import { supplyAmounts } from "./supplyAmounts";
import { uncoveredEnvelopes, type UncoveredEnvelope } from "./uncovered";

/**
 * Where a scenario meets everything it reads: the live bills and Regular income, Supplies,
 * and the transaction history. The page, the picker's remainders and the agent tools all
 * come through here, which is what keeps "the remainder the page shows" and "the remainder
 * `get_scenario` returns" the same number.
 *
 * Reads only. Nothing in this file writes the budget, Supplies or the history.
 */

export type LiveInputs = {
  todayKey: string;
  bills: ScenarioBillInput[];
  income: ScenarioIncomeInput[];
  supplyItems: SupplyItemRow[];
  groups: BudgetGroupRow[];
  categories: BudgetCategoryRow[];
  actuals: SpendingActuals;
};

/**
 * The budget side of every scenario. Bills go through `billRows` — the same function the
 * Bills page's totals come from — and Regular income is read with `regularIncomePlan`'s own
 * filter (`kind = income`, `incomeRole = regular`), so a fresh scenario equals the Bills
 * page's "after bills" remainder.
 */
export async function loadLiveInputs(userId: string): Promise<LiveInputs> {
  const todayKey = localDateKey(new Date());
  const [structure, bills, supplyItems, insightsRows] = await Promise.all([
    listBudgetStructure(userId),
    loadRecurringBills(userId),
    listSupplyItems(userId),
    loadInsightsRows(userId),
  ]);

  // `todayKey = null` and no charges: the monthly figure depends on neither, and a scenario
  // has no use for next-due dates.
  const costed = billRows(bills, [], null);
  const groupOf = new Map(structure.categories.map((c) => [c.id, c.groupId]));

  return {
    todayKey,
    bills: costed.map((row) => ({
      envelopeId: row.id,
      name: row.name,
      groupLabel: billGroupLabel(
        { groups: structure.groups },
        { groupId: groupOf.get(row.id) ?? null },
      ),
      status: row.status,
      monthlyCents: row.monthlyCents,
    })),
    income: structure.categories
      .filter((row) => row.kind === "income" && row.incomeRole === "regular")
      .map((row) => ({
        envelopeId: row.id,
        name: row.name,
        expectedMonthlyCents: row.expectedMonthlyIncomeCents,
      })),
    supplyItems,
    groups: structure.groups,
    categories: structure.categories,
    actuals: spendingActuals(insightsRows, todayKey),
  };
}

/** A scenario's records laid over the live inputs. */
export function composeRecords(
  records: ScenarioRecords,
  live: LiveInputs,
): ScenarioComposition {
  const byEnvelope = new Map<string, number | null>();
  const byGroup = new Map<string, number | null>();
  for (const line of records.lines) {
    if (line.envelopeId !== null) {
      byEnvelope.set(line.envelopeId, averageOver(live.actuals, [line.envelopeId]));
    }
    if (line.budgetGroupId !== null) {
      byGroup.set(
        line.budgetGroupId,
        groupAverage(live.actuals, live.groups, live.categories, line.budgetGroupId),
      );
    }
  }
  const input: ComposeInput = {
    bills: live.bills,
    income: live.income,
    overrides: records.overrides,
    lines: records.lines,
    supply: supplyAmounts(live.supplyItems),
    actuals: { byEnvelope, byGroup },
    billActuals: new Map(
      live.bills.map((bill) => [
        bill.envelopeId,
        averageOver(live.actuals, [bill.envelopeId]),
      ]),
    ),
  };
  return composeScenario(input);
}

/** The living spending a scenario does not reference. */
export function uncoveredFor(
  records: ScenarioRecords,
  live: LiveInputs,
): UncoveredEnvelope[] {
  return uncoveredEnvelopes({
    categories: live.categories,
    groups: live.groups,
    actuals: live.actuals,
    billEnvelopeIds: new Set(live.bills.map((bill) => bill.envelopeId)),
    linkedEnvelopeIds: new Set(
      records.lines.flatMap((line) => (line.envelopeId ? [line.envelopeId] : [])),
    ),
    linkedGroupIds: new Set(
      records.lines.flatMap((line) => (line.budgetGroupId ? [line.budgetGroupId] : [])),
    ),
  });
}

export type ScenarioSummary = {
  id: string;
  name: string;
  incomeCents: number;
  expenseCents: number;
  remainderCents: number;
  incomplete: boolean;
};

function summaryOf(records: ScenarioRecords, live: LiveInputs): ScenarioSummary {
  const composition = composeRecords(records, live);
  return {
    id: records.scenario.id,
    name: records.scenario.name,
    incomeCents: composition.incomeCents,
    expenseCents: composition.expenseCents,
    remainderCents: composition.remainderCents,
    incomplete: composition.incomplete,
  };
}

/** Every scenario with its totals — what `list_scenarios` and the picker show. */
export async function loadScenarioSummaries(
  userId: string,
): Promise<ScenarioSummary[]> {
  const [all, live] = await Promise.all([
    loadAllScenarios(userId),
    loadLiveInputs(userId),
  ]);
  return all.map((records) => summaryOf(records, live));
}

export type ScenarioDetail = {
  scenario: ScenarioRecords["scenario"];
  composition: ScenarioComposition;
  uncovered: UncoveredEnvelope[];
  /** Completed months the "Last 12 mo" figures span; zero means there is no history. */
  actualMonths: number;
  /** Every line, sub-lines included, across both sections. */
  lineCount: number;
};

/** One scenario fully composed, or null when it is not the caller's. */
export async function loadScenarioDetail(
  userId: string,
  scenarioId: string,
  live?: LiveInputs,
): Promise<ScenarioDetail | null> {
  const [records, inputs] = await Promise.all([
    loadScenario(userId, scenarioId),
    live ?? loadLiveInputs(userId),
  ]);
  if (!records) return null;
  const composition = composeRecords(records, inputs);
  return {
    scenario: records.scenario,
    composition,
    uncovered: uncoveredFor(records, inputs),
    actualMonths: inputs.actuals.months,
    lineCount: flattenLines([...composition.incomeLines, ...composition.expenseLines])
      .length,
  };
}

/**
 * "Add lines from last year's spending": one linked line per uncovered spending envelope.
 * The uncovered list is computed here, on the server, from the caller's own data — the
 * client never supplies the lines.
 */
export async function seedScenarioFromSpending(
  userId: string,
  scenarioId: string,
): Promise<number> {
  const [records, live] = await Promise.all([
    loadScenario(userId, scenarioId),
    loadLiveInputs(userId),
  ]);
  if (!records) throw new Error("That scenario does not exist.");
  return addSeedLines(userId, scenarioId, seedLines(uncoveredFor(records, live)));
}
