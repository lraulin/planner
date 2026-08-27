import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financeSupplyItems,
  financeSupplyOptions,
  type SupplyRateBasis,
} from "@/db/schema";
import { parsePackCount } from "./packSize";
import { listAmazonRepeatPurchases, listSupplyItems } from "./queries";
import {
  supplyMergeDecision,
  supplyMergeIdentity,
  type SupplyMergeDecision,
  type SupplyMergeIdentity,
} from "./merge";
import { supplySuggestions } from "./suggestions";

/**
 * Writes for the Supplies worksheet.
 *
 * Every function takes `userId` first, proves ownership before it writes, and repeats
 * `userId` in the update `where` — an update that matches nothing is indistinguishable from
 * a successful no-op, so the probe is what turns "someone else's row" into an error rather
 * than a silent nothing (`development/security.md`).
 *
 * The `rate_set` check and the one-in-use index live in the database, so the job here is to
 * hand them a shape they can accept, not to re-enforce them.
 */

export type SupplyRateInput =
  | { rateBasis: "units_per_day"; unitsPerDayMilli: number }
  | { rateBasis: "days_per_unit"; daysPerUnitTenths: number };

export type SupplyItemInput = {
  name: string;
  rate: SupplyRateInput;
  groupLabel?: string;
  envelopeId?: string | null;
  unitLabel?: string;
  notes?: string;
};

export type SupplyItemEdit = {
  name?: string;
  groupLabel?: string;
  envelopeId?: string | null;
  unitLabel?: string;
  rate?: SupplyRateInput;
  notes?: string;
};

export type SupplyOptionInput = {
  itemId: string;
  brand?: string;
  vendor?: string;
  qtyPerItem?: number;
  costPerOrderCents?: number;
  inUse?: boolean;
  pricedOn?: string | null;
  asin?: string;
  notes?: string;
};

export type SupplyOptionEdit = {
  brand?: string;
  vendor?: string;
  qtyPerItem?: number;
  costPerOrderCents?: number;
  pricedOn?: string | null;
  asin?: string;
  notes?: string;
};

async function requireSupplyItem(userId: string, itemId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeSupplyItems.id })
    .from(financeSupplyItems)
    .where(
      and(eq(financeSupplyItems.userId, userId), eq(financeSupplyItems.id, itemId)),
    )
    .limit(1);
  if (!row) throw new Error("That supply item does not exist.");
}

async function requireSupplyOption(
  userId: string,
  optionId: string,
): Promise<{ itemId: string }> {
  const [row] = await db
    .select({ itemId: financeSupplyOptions.itemId })
    .from(financeSupplyOptions)
    .where(
      and(
        eq(financeSupplyOptions.userId, userId),
        eq(financeSupplyOptions.id, optionId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That supply option does not exist.");
  return row;
}

/**
 * An envelope link is a claim about someone's own budget, so it is checked rather than
 * trusted. The FK alone would let one user point an item at another user's envelope and read
 * its name and assigned amount back off the worksheet.
 */
async function requireEnvelope(userId: string, envelopeId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.id, envelopeId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("That envelope does not exist.");
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("A supply item needs a name.");
  return trimmed;
}

/** Turn a rate input into the two columns, one of them always null. */
function rateColumns(rate: SupplyRateInput): {
  rateBasis: SupplyRateBasis;
  unitsPerDayMilli: number | null;
  daysPerUnitTenths: number | null;
} {
  if (rate.rateBasis === "units_per_day") {
    if (!Number.isInteger(rate.unitsPerDayMilli) || rate.unitsPerDayMilli <= 0) {
      throw new Error("Units per day must be greater than zero.");
    }
    return {
      rateBasis: "units_per_day",
      unitsPerDayMilli: rate.unitsPerDayMilli,
      daysPerUnitTenths: null,
    };
  }
  if (!Number.isInteger(rate.daysPerUnitTenths) || rate.daysPerUnitTenths <= 0) {
    throw new Error("Days per unit must be greater than zero.");
  }
  return {
    rateBasis: "days_per_unit",
    unitsPerDayMilli: null,
    daysPerUnitTenths: rate.daysPerUnitTenths,
  };
}

export async function createSupplyItem(
  userId: string,
  input: SupplyItemInput,
): Promise<string> {
  if (input.envelopeId) await requireEnvelope(userId, input.envelopeId);
  const [row] = await db
    .insert(financeSupplyItems)
    .values({
      userId,
      name: requireName(input.name),
      groupLabel: input.groupLabel ?? "",
      envelopeId: input.envelopeId ?? null,
      unitLabel: input.unitLabel ?? "",
      notes: input.notes ?? "",
      ...rateColumns(input.rate),
    })
    .returning({ id: financeSupplyItems.id });
  if (!row) throw new Error("Could not save that supply item.");
  return row.id;
}

export async function updateSupplyItem(
  userId: string,
  itemId: string,
  edit: SupplyItemEdit,
): Promise<void> {
  await requireSupplyItem(userId, itemId);
  if (edit.envelopeId) await requireEnvelope(userId, edit.envelopeId);
  await db
    .update(financeSupplyItems)
    .set({
      ...(edit.name !== undefined ? { name: requireName(edit.name) } : {}),
      ...(edit.groupLabel !== undefined ? { groupLabel: edit.groupLabel } : {}),
      ...(edit.envelopeId !== undefined ? { envelopeId: edit.envelopeId } : {}),
      ...(edit.unitLabel !== undefined ? { unitLabel: edit.unitLabel } : {}),
      ...(edit.notes !== undefined ? { notes: edit.notes } : {}),
      ...(edit.rate !== undefined ? rateColumns(edit.rate) : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(financeSupplyItems.userId, userId), eq(financeSupplyItems.id, itemId)),
    );
}

/** Cascades to its options — an offer for a thing you no longer buy prices nothing. */
export async function deleteSupplyItem(userId: string, itemId: string): Promise<void> {
  await requireSupplyItem(userId, itemId);
  await db
    .delete(financeSupplyItems)
    .where(
      and(eq(financeSupplyItems.userId, userId), eq(financeSupplyItems.id, itemId)),
    );
}

/**
 * Add an offer. Marking it in use goes through the same transaction as the toggle, because
 * the sibling must be cleared in the same statement pair or the partial unique index rejects
 * the intermediate state.
 */
export async function createSupplyOption(
  userId: string,
  input: SupplyOptionInput,
): Promise<string> {
  await requireSupplyItem(userId, input.itemId);
  const id = await db.transaction(async (tx) => {
    if (input.inUse) {
      await tx
        .update(financeSupplyOptions)
        .set({ inUse: false, updatedAt: new Date() })
        .where(
          and(
            eq(financeSupplyOptions.userId, userId),
            eq(financeSupplyOptions.itemId, input.itemId),
            eq(financeSupplyOptions.inUse, true),
          ),
        );
    }
    const [row] = await tx
      .insert(financeSupplyOptions)
      .values({
        userId,
        itemId: input.itemId,
        brand: input.brand ?? "",
        vendor: input.vendor ?? "",
        qtyPerItem: input.qtyPerItem ?? 1,
        costPerOrderCents: input.costPerOrderCents ?? 0,
        inUse: input.inUse ?? false,
        pricedOn: input.pricedOn ?? null,
        asin: input.asin ?? "",
        notes: input.notes ?? "",
      })
      .returning({ id: financeSupplyOptions.id });
    return row?.id;
  });
  if (!id) throw new Error("Could not save that option.");
  return id;
}

export async function updateSupplyOption(
  userId: string,
  optionId: string,
  edit: SupplyOptionEdit,
): Promise<void> {
  await requireSupplyOption(userId, optionId);
  if (edit.qtyPerItem !== undefined && edit.qtyPerItem <= 0) {
    throw new Error("A pack size must be at least one unit.");
  }
  if (edit.costPerOrderCents !== undefined && edit.costPerOrderCents < 0) {
    throw new Error("A price cannot be negative.");
  }
  await db
    .update(financeSupplyOptions)
    .set({
      ...(edit.brand !== undefined ? { brand: edit.brand } : {}),
      ...(edit.vendor !== undefined ? { vendor: edit.vendor } : {}),
      ...(edit.qtyPerItem !== undefined ? { qtyPerItem: edit.qtyPerItem } : {}),
      ...(edit.costPerOrderCents !== undefined
        ? { costPerOrderCents: edit.costPerOrderCents }
        : {}),
      ...(edit.pricedOn !== undefined ? { pricedOn: edit.pricedOn } : {}),
      ...(edit.asin !== undefined ? { asin: edit.asin } : {}),
      ...(edit.notes !== undefined ? { notes: edit.notes } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeSupplyOptions.userId, userId),
        eq(financeSupplyOptions.id, optionId),
      ),
    );
}

export async function deleteSupplyOption(
  userId: string,
  optionId: string,
): Promise<void> {
  await requireSupplyOption(userId, optionId);
  await db
    .delete(financeSupplyOptions)
    .where(
      and(
        eq(financeSupplyOptions.userId, userId),
        eq(financeSupplyOptions.id, optionId),
      ),
    );
}

/**
 * Make one offer the one that drives the item's totals.
 *
 * Clearing the sibling and setting the new one are **one transaction**: run apart, the moment
 * between them has two `in_use` rows on the item, which the partial unique index refuses. The
 * order within the transaction is clear-then-set for the same reason.
 */
export async function setSupplyOptionInUse(
  userId: string,
  optionId: string,
): Promise<void> {
  const { itemId } = await requireSupplyOption(userId, optionId);
  await db.transaction(async (tx) => {
    await tx
      .update(financeSupplyOptions)
      .set({ inUse: false, updatedAt: new Date() })
      .where(
        and(
          eq(financeSupplyOptions.userId, userId),
          eq(financeSupplyOptions.itemId, itemId),
          eq(financeSupplyOptions.inUse, true),
          ne(financeSupplyOptions.id, optionId),
        ),
      );
    await tx
      .update(financeSupplyOptions)
      .set({ inUse: true, updatedAt: new Date() })
      .where(
        and(
          eq(financeSupplyOptions.userId, userId),
          eq(financeSupplyOptions.id, optionId),
        ),
      );
  });
}

/**
 * Accept an Amazon suggestion: one item plus the offer it was inferred from, in use.
 *
 * The ASIN rides on the option so a later run of the dialog recognises what is already on the
 * worksheet instead of offering it again.
 */
export async function createSupplyItemFromSuggestion(
  userId: string,
  input: SupplyItemInput & {
    option: Omit<SupplyOptionInput, "itemId">;
  },
): Promise<string> {
  const { option, ...item } = input;
  const itemId = await createSupplyItem(userId, item);
  await createSupplyOption(userId, { ...option, itemId, inUse: true });
  return itemId;
}

export type SupplyMergePreview = {
  target: SupplyMergeIdentity;
  sources: SupplyMergeIdentity[];
  movedOptions: number;
  willPromoteInUse: boolean;
} & Pick<
  SupplyMergeDecision,
  "discardedRates" | "discardedGroups" | "discardedEnvelopes"
>;

function sourceIdsForMerge(targetId: string, sourceIds: readonly string[]): string[] {
  return [...new Set(sourceIds)].filter((id) => id !== targetId);
}

/**
 * Everything a person should see before selected items are consolidated.
 *
 * Target wins on name, rate, group, and envelope. Differing source values are named so the
 * user can pick the survivor whose rate they trust, not so the merge can refuse — Supplies
 * has no claim conflict analogous to payees.
 */
export async function previewSupplyMerge(
  userId: string,
  targetId: string,
  sourceIds: readonly string[],
): Promise<SupplyMergePreview> {
  const sources = sourceIdsForMerge(targetId, sourceIds);
  if (sources.length === 0) {
    throw new Error("Select two different items to merge.");
  }

  const items = await listSupplyItems(userId);
  const byId = new Map(items.map((item) => [item.id, item]));
  const target = byId.get(targetId);
  const sourceRows = sources.map((id) => byId.get(id));
  if (!target || sourceRows.some((row) => row === undefined)) {
    throw new Error("That supply item does not exist.");
  }
  const ownedSources = sourceRows.filter((row) => row !== undefined);
  const targetIdentity = supplyMergeIdentity(target);
  const sourceIdentities = ownedSources.map(supplyMergeIdentity);
  const inUseOptionIds = sources.flatMap((id) => {
    const row = byId.get(id);
    const inUse = row?.options.find((option) => option.inUse);
    return inUse ? [inUse.id] : [];
  });
  const decision = supplyMergeDecision(
    targetIdentity,
    sourceIdentities,
    inUseOptionIds,
  );
  return {
    target: targetIdentity,
    sources: sourceIdentities,
    movedOptions: sourceIdentities.reduce((total, row) => total + row.optionCount, 0),
    willPromoteInUse: decision.promoteOptionId !== null,
    discardedRates: decision.discardedRates,
    discardedGroups: decision.discardedGroups,
    discardedEnvelopes: decision.discardedEnvelopes,
  };
}

/**
 * Fold `sourceIds` into `targetId`.
 *
 * One transaction: reparent options with `in_use` cleared (the partial unique index cannot
 * hold two in-use offers on one item), promote a source's in-use offer only if the target
 * has none, then delete the source items. Options move first — `onDelete: cascade` would
 * otherwise wipe them.
 */
export async function mergeSupplyItems(
  userId: string,
  targetId: string,
  sourceIds: readonly string[],
): Promise<{ movedOptions: number }> {
  const sources = sourceIdsForMerge(targetId, sourceIds);
  if (sources.length === 0) return { movedOptions: 0 };

  await requireSupplyItem(userId, targetId);
  await Promise.all(sources.map((id) => requireSupplyItem(userId, id)));

  return db.transaction(async (tx) => {
    const [targetInUse] = await tx
      .select({ id: financeSupplyOptions.id })
      .from(financeSupplyOptions)
      .where(
        and(
          eq(financeSupplyOptions.userId, userId),
          eq(financeSupplyOptions.itemId, targetId),
          eq(financeSupplyOptions.inUse, true),
        ),
      )
      .limit(1);

    const sourceOptions = await tx
      .select({
        id: financeSupplyOptions.id,
        itemId: financeSupplyOptions.itemId,
        inUse: financeSupplyOptions.inUse,
      })
      .from(financeSupplyOptions)
      .where(
        and(
          eq(financeSupplyOptions.userId, userId),
          inArray(financeSupplyOptions.itemId, sources),
        ),
      );

    let promoteOptionId: string | null = null;
    if (!targetInUse) {
      for (const sourceId of sources) {
        const inUse = sourceOptions.find(
          (option) => option.itemId === sourceId && option.inUse,
        );
        if (inUse) {
          promoteOptionId = inUse.id;
          break;
        }
      }
    }

    if (sourceOptions.length > 0) {
      await tx
        .update(financeSupplyOptions)
        .set({ itemId: targetId, inUse: false, updatedAt: new Date() })
        .where(
          and(
            eq(financeSupplyOptions.userId, userId),
            inArray(
              financeSupplyOptions.id,
              sourceOptions.map((option) => option.id),
            ),
          ),
        );
    }

    if (promoteOptionId) {
      await tx
        .update(financeSupplyOptions)
        .set({ inUse: true, updatedAt: new Date() })
        .where(
          and(
            eq(financeSupplyOptions.userId, userId),
            eq(financeSupplyOptions.id, promoteOptionId),
          ),
        );
    }

    await tx
      .delete(financeSupplyItems)
      .where(
        and(
          eq(financeSupplyItems.userId, userId),
          inArray(financeSupplyItems.id, sources),
        ),
      );

    return { movedOptions: sourceOptions.length };
  });
}

async function requireUnusedAsin(userId: string, asin: string): Promise<void> {
  const [existing] = await db
    .select({ id: financeSupplyOptions.id })
    .from(financeSupplyOptions)
    .where(
      and(eq(financeSupplyOptions.userId, userId), eq(financeSupplyOptions.asin, asin)),
    )
    .limit(1);
  if (existing) throw new Error("That item is already on the Supplies worksheet.");
}

async function amazonSupplyPrefill(userId: string, asin: string) {
  const [purchase] = await listAmazonRepeatPurchases(userId, { minOrders: 1, asin });
  if (!purchase) throw new Error("That order item is not on file.");
  await requireUnusedAsin(userId, asin);
  const [suggestion] = supplySuggestions([purchase]);
  const packCount = suggestion?.qtyPerItem ?? parsePackCount(purchase.productName) ?? 1;
  const rate: SupplyRateInput =
    suggestion === undefined
      ? { rateBasis: "days_per_unit", daysPerUnitTenths: 300 }
      : suggestion.rateBasis === "units_per_day"
        ? {
            rateBasis: "units_per_day",
            unitsPerDayMilli: suggestion.unitsPerDayMilli ?? 1,
          }
        : {
            rateBasis: "days_per_unit",
            daysPerUnitTenths: suggestion.daysPerUnitTenths ?? 1,
          };
  return {
    purchase,
    rate,
    option: {
      vendor: "Amazon",
      qtyPerItem: packCount,
      costPerOrderCents: purchase.latestUnitPriceCents ?? 0,
      pricedOn: purchase.lastOrderDate,
      asin,
    } satisfies Omit<SupplyOptionInput, "itemId">,
  };
}

/**
 * Add one Amazon line item as a new worksheet item — the Orders "New item" path.
 *
 * Same ASIN-scoped aggregate as Suggest from Amazon, so the rate comes from the whole
 * purchase history rather than the single row that was right-clicked. One order falls back
 * to a 30-days-per-unit placeholder.
 */
export async function addSupplyItemFromAmazon(
  userId: string,
  asin: string,
): Promise<string> {
  const prefill = await amazonSupplyPrefill(userId, asin);
  return createSupplyItemFromSuggestion(userId, {
    name: prefill.purchase.productName,
    rate: prefill.rate,
    option: prefill.option,
  });
}

/**
 * Attach an Amazon product as an offer on an existing item.
 *
 * Does not rewrite the item's rate, group, or envelope — Amazon's inferred rate is a guess
 * for new items, and this item already has one. The first offer on an item with none in use
 * becomes in use; otherwise it lands as a comparison.
 */
export async function addSupplyOptionFromAmazon(
  userId: string,
  itemId: string,
  asin: string,
): Promise<string> {
  await requireSupplyItem(userId, itemId);
  const prefill = await amazonSupplyPrefill(userId, asin);
  const [inUse] = await db
    .select({ id: financeSupplyOptions.id })
    .from(financeSupplyOptions)
    .where(
      and(
        eq(financeSupplyOptions.userId, userId),
        eq(financeSupplyOptions.itemId, itemId),
        eq(financeSupplyOptions.inUse, true),
      ),
    )
    .limit(1);
  return createSupplyOption(userId, {
    ...prefill.option,
    itemId,
    brand: prefill.purchase.productName,
    inUse: inUse === undefined,
  });
}
