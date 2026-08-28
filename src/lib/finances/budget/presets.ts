/**
 * The two ways to start a budget, and the opinion baked into which one is recommended.
 *
 * The user's account of why YNAB became busywork is specific and worth encoding: they adopted
 * its **default suggested category list** and then spent their time shuffling money between
 * two dozen envelopes. That was a configuration choice, not a property of envelope budgeting
 * — which is why `2026-08-16-1938-commitments` D0 is narrowed here rather than discarded. The
 * product's answer to D0 is this file: offer few envelopes first.
 *
 * Spec: `agent-os/specs/2026-08-22-1948-zero-based-budget/` D5.
 */

import type { EnvelopeKind } from "@/db/schema";

export const BUDGET_PRESETS = ["minimal", "detailed"] as const;
export type BudgetPreset = (typeof BUDGET_PRESETS)[number];

export type PresetCategory = { name: string };

/**
 * A run of preset envelopes, and where they land.
 *
 * `name: null` puts them at their **section root** rather than in a group. A group that
 * merely names the section it is in — "Income", "Spending", "Savings" — repeats the section
 * heading and says nothing, which is why `sectionGridRows` used to hide it. Groups that
 * organise *within* a section, like Home and Everyday, are kept
 * (`agent-os/specs/2026-08-28-1613-group-kind/` D5).
 *
 * One `kind` for the group and everything in it: an envelope's kind must equal its group's,
 * so the group is the only place it needs stating.
 */
export type PresetGroup = {
  name: string | null;
  kind: EnvelopeKind;
  categories: readonly PresetCategory[];
};

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
  { name: null, kind: "income", categories: [{ name: "Income" }] },
  {
    name: null,
    kind: "spending",
    categories: [
      { name: "Bills" },
      { name: "Recurring spend" },
      { name: "Discretionary" },
    ],
  },
  { name: null, kind: "savings", categories: [{ name: "Savings" }] },
];

/**
 * One envelope per spending category, grouped.
 *
 * Here because the choice is the user's and refusing to offer it would be preachy, not
 * because it is a good idea for this situation.
 */
const DETAILED: readonly PresetGroup[] = [
  { name: null, kind: "income", categories: [{ name: "Income" }] },
  {
    name: "Home",
    kind: "spending",
    categories: [
      "Rent & Housing",
      "Utilities",
      "Phone & Internet",
      "Home & Security",
      "Insurance",
    ].map((name) => ({ name })),
  },
  {
    name: "Everyday",
    kind: "spending",
    categories: [
      "Groceries",
      "Dining",
      "Gas & Auto",
      "Health",
      "Personal Care",
      "Pets",
    ].map((name) => ({ name })),
  },
  {
    name: "Enjoyment",
    kind: "spending",
    categories: [
      "Streaming & Media",
      "Entertainment",
      "Games",
      "AI",
      "Productivity & Security",
      "Software & Development",
      "Shopping",
      "Travel",
    ].map((name) => ({ name })),
  },
  {
    name: "Obligations",
    kind: "spending",
    categories: ["Taxes", "Fees & Interest", "Professional Services"].map((name) => ({
      name,
    })),
  },
  { name: null, kind: "savings", categories: [{ name: "Savings" }] },
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
    "Five envelopes: bills, recurring spend, discretionary, savings, and income.",
  detailed:
    "One envelope per spending category, plus a Savings envelope. More to look at, and more to move money between.",
};
