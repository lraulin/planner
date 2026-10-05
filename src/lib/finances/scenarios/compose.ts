import type { ScenarioLineKind } from "@/db/schema";
import { compare } from "@/lib/tree/sortKey";
import {
  leafMonthlyCents,
  periodAmounts,
  type LineAmountSource,
  type PeriodAmounts,
  type SupplyAmounts,
} from "./amount";

/**
 * Everything a scenario shows, as one value: the live bills and Regular income with the
 * scenario's overrides laid over them, its lines as a tree, and the totals and remainder.
 *
 * Pure. The query layer reads the budget, Supplies and the transaction history and hands
 * them in; nothing here knows a table exists, which is what lets the arithmetic that decides
 * "will income cover this month?" be tested without one.
 */

export type ScenarioBillInput = {
  envelopeId: string;
  name: string;
  /** The Bills page's group label for it, for the collapsible bill groups. */
  groupLabel: string;
  status: "active" | "paused" | "cancelled";
  /** `annual ÷ 12`, rounded per bill — the figure `billRows` carries. */
  monthlyCents: number;
};

export type ScenarioIncomeInput = {
  envelopeId: string;
  name: string;
  /** Null is unknown, not zero: the same rule `regularIncomePlan` applies. */
  expectedMonthlyCents: number | null;
};

export type ScenarioOverrideInput = {
  envelopeId: string;
  included: boolean;
  /** Null keeps the live figure. */
  monthlyCents: number | null;
};

export type ScenarioLineInput = {
  id: string;
  parentId: string | null;
  kind: ScenarioLineKind;
  sortKey: string;
  name: string;
  source: LineAmountSource;
  envelopeId: string | null;
  budgetGroupId: string | null;
};

/** What the line's actuals link points at, resolved by the caller. Null means no history. */
export type LineActuals = {
  byEnvelope: ReadonlyMap<string, number | null>;
  byGroup: ReadonlyMap<string, number | null>;
};

export type ComposeInput = {
  bills: readonly ScenarioBillInput[];
  income: readonly ScenarioIncomeInput[];
  overrides: readonly ScenarioOverrideInput[];
  lines: readonly ScenarioLineInput[];
  supply: SupplyAmounts;
  actuals: LineActuals;
  /** Average monthly spend per bill envelope; absent means no spending in the window. */
  billActuals: ReadonlyMap<string, number | null>;
};

export type ScenarioBillRow = {
  envelopeId: string;
  name: string;
  groupLabel: string;
  status: ScenarioBillInput["status"];
  /** Whether this scenario counts it: the override if there is one, else `status = active`. */
  included: boolean;
  /** What it would be with no override. */
  defaultIncluded: boolean;
  liveMonthlyCents: number;
  /** The override's amount, or null when the scenario keeps the live one. */
  overrideMonthlyCents: number | null;
  /** True when the scenario carries an override row of any kind. */
  overridden: boolean;
  /** The figure shown: the override if it replaces the amount, else the live one. */
  monthlyCents: number;
  actualMonthlyCents: number | null;
};

export type ScenarioIncomeRow = {
  envelopeId: string;
  name: string;
  included: boolean;
  liveMonthlyCents: number | null;
  overrideMonthlyCents: number | null;
  overridden: boolean;
  /** The figure shown; null while the expectation is unset and nothing replaces it. */
  monthlyCents: number | null;
};

export type ScenarioLineNode = {
  id: string;
  parentId: string | null;
  kind: ScenarioLineKind;
  name: string;
  depth: number;
  /** Has sub-lines: shows their sum and has no amount of its own. */
  isRollup: boolean;
  source: LineAmountSource;
  /** A leaf's amount from its source; a roll-up's is the sum of its children. */
  monthlyCents: number;
  envelopeId: string | null;
  budgetGroupId: string | null;
  /** Average monthly spend of what the line links to, or null without a link or history. */
  actualMonthlyCents: number | null;
  /** Plan minus actual. Negative means the plan is under what was actually spent. */
  differenceCents: number | null;
  children: ScenarioLineNode[];
};

export type ScenarioComposition = {
  incomeRows: ScenarioIncomeRow[];
  incomeLines: ScenarioLineNode[];
  billRows: ScenarioBillRow[];
  expenseLines: ScenarioLineNode[];
  /** Income counted: included envelopes at their known figure, plus income lines. */
  incomeCents: number;
  /** Bills counted plus expense lines. */
  expenseCents: number;
  billsCents: number;
  linesCents: number;
  /** `incomeCents − expenseCents`. Read it with `incomplete`. */
  remainderCents: number;
  /** An included Regular income envelope has no figure, so the income above is a floor. */
  incomplete: boolean;
  incompleteNames: string[];
  periods: {
    income: PeriodAmounts;
    expenses: PeriodAmounts;
    remainder: PeriodAmounts;
  };
};

function lineTree(
  lines: readonly ScenarioLineInput[],
  input: ComposeInput,
): ScenarioLineNode[] {
  const byParent = new Map<string | null, ScenarioLineInput[]>();
  for (const line of lines) {
    const list = byParent.get(line.parentId) ?? [];
    list.push(line);
    byParent.set(line.parentId, list);
  }

  function build(line: ScenarioLineInput, depth: number): ScenarioLineNode {
    const children = (byParent.get(line.id) ?? [])
      .sort((a, b) => compare(a.sortKey, b.sortKey))
      .map((child) => build(child, depth + 1));
    const isRollup = children.length > 0;
    const monthlyCents = isRollup
      ? children.reduce((sum, child) => sum + child.monthlyCents, 0)
      : leafMonthlyCents(line.source, input.supply);
    const actualMonthlyCents =
      line.envelopeId !== null
        ? (input.actuals.byEnvelope.get(line.envelopeId) ?? null)
        : line.budgetGroupId !== null
          ? (input.actuals.byGroup.get(line.budgetGroupId) ?? null)
          : null;
    return {
      id: line.id,
      parentId: line.parentId,
      kind: line.kind,
      name: line.name,
      depth,
      isRollup,
      source: line.source,
      monthlyCents,
      envelopeId: line.envelopeId,
      budgetGroupId: line.budgetGroupId,
      actualMonthlyCents,
      differenceCents:
        actualMonthlyCents === null ? null : monthlyCents - actualMonthlyCents,
      children,
    };
  }

  return (byParent.get(null) ?? [])
    .sort((a, b) => compare(a.sortKey, b.sortKey))
    .map((line) => build(line, 0));
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

export function composeScenario(input: ComposeInput): ScenarioComposition {
  const overrideBy = new Map(input.overrides.map((o) => [o.envelopeId, o]));

  const billRows = input.bills.map<ScenarioBillRow>((bill) => {
    const override = overrideBy.get(bill.envelopeId);
    const defaultIncluded = bill.status === "active";
    return {
      envelopeId: bill.envelopeId,
      name: bill.name,
      groupLabel: bill.groupLabel,
      status: bill.status,
      included: override?.included ?? defaultIncluded,
      defaultIncluded,
      liveMonthlyCents: bill.monthlyCents,
      overrideMonthlyCents: override?.monthlyCents ?? null,
      overridden: override !== undefined,
      monthlyCents: override?.monthlyCents ?? bill.monthlyCents,
      actualMonthlyCents: input.billActuals.get(bill.envelopeId) ?? null,
    };
  });

  const incomeRows = input.income.map<ScenarioIncomeRow>((envelope) => {
    const override = overrideBy.get(envelope.envelopeId);
    return {
      envelopeId: envelope.envelopeId,
      name: envelope.name,
      included: override?.included ?? true,
      liveMonthlyCents: envelope.expectedMonthlyCents,
      overrideMonthlyCents: override?.monthlyCents ?? null,
      overridden: override !== undefined,
      monthlyCents: override?.monthlyCents ?? envelope.expectedMonthlyCents,
    };
  });

  const tree = lineTree(input.lines, input);
  const incomeLines = tree.filter((node) => node.kind === "income");
  const expenseLines = tree.filter((node) => node.kind === "expense");

  const counted = incomeRows.filter((row) => row.included);
  const incompleteNames = counted
    .filter((row) => row.monthlyCents === null)
    .map((row) => row.name);

  const billsCents = sum(
    billRows.filter((row) => row.included).map((r) => r.monthlyCents),
  );
  const linesCents = sum(expenseLines.map((node) => node.monthlyCents));
  const incomeCents =
    sum(counted.map((row) => row.monthlyCents ?? 0)) +
    sum(incomeLines.map((node) => node.monthlyCents));
  const expenseCents = billsCents + linesCents;
  const remainderCents = incomeCents - expenseCents;

  return {
    incomeRows,
    incomeLines,
    billRows,
    expenseLines,
    incomeCents,
    expenseCents,
    billsCents,
    linesCents,
    remainderCents,
    incomplete: incompleteNames.length > 0,
    incompleteNames,
    periods: {
      income: periodAmounts(incomeCents),
      expenses: periodAmounts(expenseCents),
      remainder: periodAmounts(remainderCents),
    },
  };
}

/** Every line in a tree, parents before children — for totals and link bookkeeping. */
export function flattenLines(nodes: readonly ScenarioLineNode[]): ScenarioLineNode[] {
  return nodes.flatMap((node) => [node, ...flattenLines(node.children)]);
}
