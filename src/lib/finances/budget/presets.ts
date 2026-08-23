/**
 * The two ways to start a budget, and the opinion baked into which one is recommended.
 *
 * The user's account of why YNAB became busywork is specific and worth encoding: they adopted
 * its **default suggested category list** and then spent their time shuffling money between
 * two dozen envelopes. That was a configuration choice, not a property of envelope budgeting
 * — which is why `2026-08-16-1938-commitments` D0 is narrowed here rather than discarded. The
 * product's answer to D0 is this file: offer few envelopes first, and make choosing few cost
 * nothing, because `sourceCategories` lets one envelope claim a dozen spending categories.
 *
 * Spec: `agent-os/specs/2026-08-22-1948-zero-based-budget/` D5.
 */

import { FINANCE_CATEGORIES, type FinanceCategory } from "../classify/categories";

export const BUDGET_PRESETS = ["minimal", "detailed"] as const;
export type BudgetPreset = (typeof BUDGET_PRESETS)[number];

export type PresetCategory = {
  name: string;
  sourceCategories: readonly FinanceCategory[];
};

export type PresetGroup = {
  name: string;
  isIncome: boolean;
  categories: readonly PresetCategory[];
};

/** Everything the taxonomy has that is not obviously a bill, a habit, or savings. */
const DISCRETIONARY: readonly FinanceCategory[] = [
  "Dining",
  "Streaming & Media",
  "Entertainment",
  "Software & AI",
  "Games",
  "Shopping",
  "Personal Care",
  "Travel",
  "Health",
  "Pets",
];

const BILLS: readonly FinanceCategory[] = [
  "Rent & Housing",
  "Utilities",
  "Phone & Internet",
  "Insurance",
  "Home & Security",
  "Taxes",
  "Fees & Interest",
  "Professional Services",
];

const HABITS: readonly FinanceCategory[] = ["Groceries", "Gas & Auto"];

/**
 * Five envelopes, and the recommendation.
 *
 * The split is by **how much choice you have about the money**, not by what it buys: bills
 * land whether or not you are watching, groceries and fuel are a rhythm you cannot skip for
 * long, and everything left is a decision you make in the moment. Those are three different
 * conversations to have with yourself, which is the most a budget can usefully separate for
 * someone digging out. Savings is fifth because it has to be assigned to exist at all.
 */
const MINIMAL: readonly PresetGroup[] = [
  {
    name: "Income",
    isIncome: true,
    categories: [{ name: "Income", sourceCategories: [] }],
  },
  {
    name: "Spending",
    isIncome: false,
    categories: [
      { name: "Bills", sourceCategories: BILLS },
      { name: "Recurring spend", sourceCategories: HABITS },
      { name: "Discretionary", sourceCategories: DISCRETIONARY },
      { name: "Savings", sourceCategories: [] },
    ],
  },
];

/**
 * One envelope per spending category, grouped.
 *
 * Here because the choice is the user's and refusing to offer it would be preachy, not
 * because it is a good idea for this situation. Every category claims exactly itself, so the
 * budget's axis and the classifier's agree row for row — which is genuinely useful if you
 * want the budget to double as a spending report, and is exactly the shape that turned into
 * shuffling last time.
 */
const DETAILED: readonly PresetGroup[] = [
  {
    name: "Income",
    isIncome: true,
    categories: [{ name: "Income", sourceCategories: [] }],
  },
  {
    name: "Home",
    isIncome: false,
    categories: [
      "Rent & Housing",
      "Utilities",
      "Phone & Internet",
      "Home & Security",
      "Insurance",
    ].map((name) => ({ name, sourceCategories: [name as FinanceCategory] })),
  },
  {
    name: "Everyday",
    isIncome: false,
    categories: [
      "Groceries",
      "Dining",
      "Gas & Auto",
      "Health",
      "Personal Care",
      "Pets",
    ].map((name) => ({ name, sourceCategories: [name as FinanceCategory] })),
  },
  {
    name: "Enjoyment",
    isIncome: false,
    categories: [
      "Streaming & Media",
      "Entertainment",
      "Games",
      "Software & AI",
      "Shopping",
      "Travel",
    ].map((name) => ({ name, sourceCategories: [name as FinanceCategory] })),
  },
  {
    name: "Obligations",
    isIncome: false,
    categories: ["Taxes", "Fees & Interest", "Professional Services"].map((name) => ({
      name,
      sourceCategories: [name as FinanceCategory],
    })),
  },
];

export const PRESET_GROUPS: Record<BudgetPreset, readonly PresetGroup[]> = {
  minimal: MINIMAL,
  detailed: DETAILED,
};

export const PRESET_LABELS: Record<BudgetPreset, string> = {
  minimal: "Minimal",
  detailed: "One per category",
};

export const PRESET_DESCRIPTIONS: Record<BudgetPreset, string> = {
  minimal:
    "Five envelopes: bills, recurring spend, discretionary, savings, and income. Each one claims several spending categories, so nothing goes uncategorised.",
  detailed:
    "One envelope per spending category. More to look at, and more to move money between.",
};

/**
 * Every taxonomy value a preset claims, exactly once.
 *
 * Both presets must be exhaustive: a category no envelope claims is a transaction the
 * auto-map cannot place, and it would land in the backlog forever without anyone being told
 * why. A test pins this rather than a comment asking nicely.
 */
export function claimedCategories(preset: BudgetPreset): string[] {
  return PRESET_GROUPS[preset].flatMap((group) =>
    group.categories.flatMap((category) => [...category.sourceCategories]),
  );
}

/** Taxonomy values no envelope in this preset would claim. Empty for both, by test. */
export function unclaimedCategories(preset: BudgetPreset): string[] {
  const claimed = new Set(claimedCategories(preset));
  return FINANCE_CATEGORIES.filter((category) => !claimed.has(category));
}
