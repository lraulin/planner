/**
 * Input and output contracts for the envelope-budget tools.
 *
 * Kept beside `contracts.ts` rather than inside it, and spread into its two maps, so the
 * budget surface reads as one unit. Every field carries its own `.describe()`:
 * `fieldDescriptions` in tools.ts is a flat map keyed by field name, and names such as
 * `kind`, `status` and `hidden` already mean something else there.
 */

import { z } from "zod";
import { ENVELOPE_KINDS } from "@/db/schema";
import { pageInfoSchema } from "./pageInfoSchema";

const id = z.uuid().describe("Planner UUID returned by a prior tool call.");
const cents = z.number().int().describe("Integer cents. 100 = $1.00.");
const positiveCents = z
  .number()
  .int()
  .min(1)
  .max(100_000_000_00)
  .describe("Positive integer cents. 62365 = $623.65.");
const monthParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/)
  .describe("Budget month as YYYY-MM (2026-10). YYYY-MM-01 is accepted too.");
const envelopeKind = z
  .enum(ENVELOPE_KINDS)
  .describe(
    "Budget section: spending (ordinary bucket), bill (bucket with a cadence), savings (held out of the spending-vs-income total), or income (no assignment or balance).",
  );
const envelopeName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .describe("Envelope name as the Budget page shows it, e.g. Vet / Pet Medical.");

const monthSummarySchema = z.strictObject({
  incomeCents: cents.describe(
    "Income received this month (income envelopes' activity).",
  ),
  fromLastMonthCents: cents.describe(
    "Ready to Assign carried in from the previous month (the opening balance in the first month).",
  ),
  lastMonthOverspentCents: cents.describe(
    "Zero or negative: last month's overspending that no carryover absorbed, charged to this month.",
  ),
  assignedCents: cents.describe("Total assigned to every expense envelope this month."),
  activityCents: cents.describe(
    "Total expense-envelope activity this month. Negative is spending.",
  ),
  availableCents: cents.describe("Sum of every expense envelope's available balance."),
  heldForNextMonthCents: cents.describe("Legacy hold for next month; usually 0."),
  assignedInFutureMonthsCents: cents.describe(
    "Assigned in later months, subtracted from this month's Ready to Assign.",
  ),
  uncategorizedActivityCents: cents.describe(
    "Uncategorized on-budget activity counted in Ready to Assign (current month only).",
  ),
  readyToAssignCents: cents.describe(
    "To be assigned. Negative means more is assigned than the budget holds.",
  ),
});

const budgetGroupSchema = z.strictObject({
  id,
  name: z.string().describe("Group name."),
  kind: envelopeKind,
  parentGroupId: id
    .nullable()
    .describe("Enclosing group, or null at the section root."),
  hidden: z.boolean().describe("Hidden groups still count toward every total."),
});

const budgetEnvelopeRowSchema = z.strictObject({
  id,
  name: z.string().describe("Envelope name."),
  kind: envelopeKind,
  groupId: id
    .nullable()
    .describe("Group the envelope sits in; null at the section root."),
  assignedCents: cents.describe("Assigned to this envelope this month."),
  activityCents: cents.describe("This month's activity. Negative is spending."),
  availableCents: cents.describe(
    "Available balance at the end of the month: carry-in + assigned + activity.",
  ),
  goalCents: cents
    .optional()
    .describe("Template goal for this month; absent when none was applied."),
  hidden: z
    .literal(true)
    .optional()
    .describe(
      "Present only on hidden (archived) envelopes, when includeHidden is set.",
    ),
});

const incomeEnvelopeRowSchema = z.strictObject({
  id,
  name: z.string().describe("Income envelope name."),
  groupId: id
    .nullable()
    .describe("Group the envelope sits in; null at the section root."),
  receivedCents: cents.describe("Income filed to this envelope this month."),
  hidden: z
    .literal(true)
    .optional()
    .describe("Present only on hidden envelopes, when includeHidden is set."),
});

/** One envelope's figures after a write, so the caller need not re-read the month. */
const envelopeMonthSchema = z.strictObject({
  id,
  name: z.string().describe("Envelope name."),
  assignedCents: cents.describe("Assigned this month after the change."),
  availableCents: cents.describe("Available balance after the change."),
});

const budgetEnvelopeDetailSchema = z.strictObject({
  id,
  name: z.string().describe("Envelope name."),
  kind: envelopeKind,
  groupId: id
    .nullable()
    .describe("Group the envelope sits in; null at the section root."),
  groupName: z.string().nullable().describe("That group's name, or null."),
  hidden: z.boolean().describe("Hidden (archived) envelopes keep history and totals."),
  notes: z.string().describe("Free-text notes on the envelope."),
});

const splitLineSchema = z.strictObject({
  id,
  amountCents: cents.describe("Signed cents, same sign convention as the parent row."),
  envelopeId: id
    .nullable()
    .describe("Envelope this line is filed to; null is unassigned."),
  envelopeName: z.string().nullable().describe("That envelope's name, or null."),
  notes: z.string().describe("Line note."),
});

export const budgetInputSchemas = {
  get_budget_month: z.strictObject({
    month: monthParam
      .optional()
      .describe(
        "Budget month as YYYY-MM. Defaults to the current month (America/New_York).",
      ),
    includeHidden: z
      .boolean()
      .default(false)
      .describe(
        "Also list hidden (archived) envelopes and groups. Their money counts in the totals either way.",
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Zero-based offset into the envelope list, in Budget page order."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe("Maximum envelopes to return (default 50, max 60)."),
  }),
  create_budget_group: z.strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe("Group name, e.g. Pets. Must be unique among its siblings."),
    kind: envelopeKind.describe(
      "Section the group lives in; every envelope inside must have this kind.",
    ),
    parentGroupId: id
      .nullable()
      .optional()
      .describe(
        "Enclosing group of the same kind, or null/omitted for the section root.",
      ),
  }),
  update_budget_group: z.strictObject({
    id: id.describe("Group id from get_budget_month."),
    name: z.string().trim().min(1).max(120).describe("New group name."),
  }),
  create_budget_envelope: z.strictObject({
    name: envelopeName,
    kind: envelopeKind
      .default("spending")
      .describe(
        "Section: spending (default), savings, bill, or income. Must match the group's kind when groupId is given.",
      ),
    groupId: id
      .nullable()
      .optional()
      .describe(
        "Group to put the envelope in (from get_budget_month). Omit or null for the section root.",
      ),
    notes: z.string().max(2000).optional().describe("Optional free-text notes."),
  }),
  update_budget_envelope: z.strictObject({
    id: id.describe("Envelope id from get_budget_month."),
    name: envelopeName.optional().describe("New envelope name."),
    groupId: id
      .nullable()
      .optional()
      .describe("Move into this group (same kind), or null to the section root."),
    kind: envelopeKind
      .optional()
      .describe(
        "Change section. An envelope in a group of another kind moves to the new section's root.",
      ),
    hidden: z
      .boolean()
      .optional()
      .describe(
        "true archives (hides) the envelope: history, balance and totals stay. false restores it.",
      ),
    notes: z.string().max(2000).optional().describe("Replace the envelope's notes."),
  }),
  set_budget_assignment: z.strictObject({
    month: monthParam,
    envelopeId: id.describe("Expense envelope id from get_budget_month."),
    amountCents: z
      .number()
      .int()
      .min(0)
      .max(100_000_000_00)
      .optional()
      .describe(
        "Set this month's Assigned to exactly this many cents (0 or more). Give this or adjustCents.",
      ),
    adjustCents: z
      .number()
      .int()
      .min(-100_000_000_00)
      .max(100_000_000_00)
      .optional()
      .describe(
        "Add (positive) or remove (negative) this many cents to this month's Assigned. Give this or amountCents.",
      ),
  }),
  move_budget_money: z.strictObject({
    month: monthParam,
    fromEnvelopeId: id.describe("Envelope the money leaves (from get_budget_month)."),
    toEnvelopeId: id.describe("Envelope the money goes to."),
    amountCents: positiveCents.describe(
      "Positive cents to move. Refused, with nothing changed, if it exceeds the source's available balance.",
    ),
  }),
  set_transaction_category: z.strictObject({
    ids: z
      .array(id)
      .min(1)
      .max(50)
      .describe("Transaction ids from search_transactions."),
    envelopeId: id
      .nullable()
      .describe("Envelope to file the rows to, or null to make them uncategorized."),
  }),
  split_transaction: z.strictObject({
    id: id.describe("Transaction id from search_transactions (a top-level row)."),
    splits: z
      .array(
        z.strictObject({
          amountCents: cents.describe(
            "Signed cents, same sign as the parent: -2500 is $25.00 of a charge.",
          ),
          envelopeId: id
            .nullable()
            .describe("Envelope for this line, or null to leave it unassigned."),
          notes: z.string().max(500).optional().describe("Optional line note."),
        }),
      )
      .max(50)
      .describe(
        "The complete set of lines; they must sum exactly to the row's amount. Replaces any existing split. An empty list unsplits the row.",
      ),
  }),
} as const;

export const budgetOutputSchemas = {
  get_budget_month: z.strictObject({
    month: z.string().describe("The month read, YYYY-MM."),
    firstMonth: z.string().describe("Earliest budget month, YYYY-MM."),
    lastMonth: z
      .string()
      .describe("Latest budget month (the planning horizon), YYYY-MM."),
    summary: monthSummarySchema,
    uncategorized: z.strictObject({
      count: z.number().int().min(0).describe("On-budget rows with no envelope."),
      cents: cents.describe("Their signed total."),
    }),
    groups: z.array(budgetGroupSchema),
    income: z.array(incomeEnvelopeRowSchema),
    envelopes: z.array(budgetEnvelopeRowSchema),
    hiddenEnvelopeCount: z
      .number()
      .int()
      .min(0)
      .describe(
        "Hidden envelopes, and cancelled bills with nothing in them, left out of the lists (0 when includeHidden is set).",
      ),
    pageInfo: pageInfoSchema,
  }),
  create_budget_group: z.strictObject({
    created: z.literal(true),
    group: budgetGroupSchema,
  }),
  update_budget_group: z.strictObject({ group: budgetGroupSchema }),
  create_budget_envelope: z.strictObject({
    created: z.literal(true),
    envelope: budgetEnvelopeDetailSchema,
  }),
  update_budget_envelope: z.strictObject({ envelope: budgetEnvelopeDetailSchema }),
  set_budget_assignment: z.strictObject({
    applied: z.boolean().describe("False when the amount was already what was asked."),
    month: z.string().describe("YYYY-MM."),
    envelope: envelopeMonthSchema,
    previousAssignedCents: cents.describe("Assigned before the change."),
    readyToAssignCents: cents.describe("The month's Ready to Assign after the change."),
    warnings: z.array(z.string()),
  }),
  move_budget_money: z.strictObject({
    moved: z.literal(true),
    month: z.string().describe("YYYY-MM."),
    amountCents: cents.describe("Exactly the amount asked for."),
    from: envelopeMonthSchema,
    to: envelopeMonthSchema,
    readyToAssignCents: cents.describe(
      "Unchanged by a move; returned for confirmation.",
    ),
  }),
  set_transaction_category: z.strictObject({
    envelope: z
      .strictObject({ id, name: z.string().describe("Envelope name.") })
      .nullable()
      .describe("Where the rows were filed; null when they were made uncategorized."),
    updated: z.array(id).describe("Rows whose envelope was written."),
    skipped: z
      .array(
        z.strictObject({ id, reason: z.string().describe("Why it was not changed.") }),
      )
      .describe(
        "Rows left alone: not found, off-budget, split parents, transfers between budget accounts.",
      ),
  }),
  split_transaction: z.strictObject({
    id,
    split: z.boolean().describe("False when the row is now an ordinary unsplit row."),
    amountCents: cents.describe("The parent row's amount."),
    lines: z.array(splitLineSchema),
  }),
} as const;
