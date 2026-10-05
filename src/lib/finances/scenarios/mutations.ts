import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financeCategoryGroups,
  financeScenarioLines,
  financeScenarioOverrides,
  financeScenarios,
  financeSupplyGroups,
  financeSupplyItems,
  SCENARIO_LINE_KINDS,
  type ScenarioLineKind,
} from "@/db/schema";
import { between, after, compare, first } from "@/lib/tree/sortKey";
import {
  lineSourceOf,
  sourceColumns,
  type LineAmountSource,
  type LineSourceColumns,
} from "./amount";
import type { SeedLine } from "./seed";
import { splitLine } from "./split";

/**
 * Writes for the Scenarios worksheet.
 *
 * Every function takes `userId` first and proves ownership of **every id it was given** —
 * the scenario, the parent, and the envelope, budget group, supply item or supply group a
 * line points at — before writing. A foreign key alone would let one user attach a line to
 * another's envelope and read its name and average spend back off the worksheet
 * (`development/security.md`). The composite foreign keys on the scenario tables are the
 * second line: even a mutation that forgot the check could not file a row under someone
 * else's scenario.
 *
 * Nothing here touches the budget or Supplies.
 */

type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export type LineLink = { envelopeId: string } | { budgetGroupId: string } | null;

const NOT_YOURS = {
  scenario: "That scenario does not exist.",
  line: "That line does not exist.",
  envelope: "That envelope does not exist.",
  budgetGroup: "That budget group does not exist.",
  supplyItem: "That supply item does not exist.",
  supplyGroup: "That supply group does not exist.",
} as const;

function requireName(name: string, what: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error(`A ${what} needs a name.`);
  return trimmed;
}

async function requireScenario(
  userId: string,
  scenarioId: string,
  executor: Executor = db,
): Promise<void> {
  const [row] = await executor
    .select({ id: financeScenarios.id })
    .from(financeScenarios)
    .where(
      and(eq(financeScenarios.userId, userId), eq(financeScenarios.id, scenarioId)),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.scenario);
}

type LineRow = typeof financeScenarioLines.$inferSelect;

async function requireLine(
  userId: string,
  lineId: string,
  executor: Executor = db,
): Promise<LineRow> {
  const [row] = await executor
    .select()
    .from(financeScenarioLines)
    .where(
      and(eq(financeScenarioLines.userId, userId), eq(financeScenarioLines.id, lineId)),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.line);
  return row;
}

async function requireEnvelope(
  userId: string,
  envelopeId: string,
  kinds?: readonly string[],
): Promise<void> {
  const [row] = await db
    .select({ kind: financeBudgetCategories.kind })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.id, envelopeId),
      ),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.envelope);
  if (kinds && !kinds.includes(row.kind)) {
    throw new Error("Only a bill or a Regular income envelope can be overridden.");
  }
}

async function requireBudgetGroup(userId: string, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeCategoryGroups.id })
    .from(financeCategoryGroups)
    .where(
      and(
        eq(financeCategoryGroups.userId, userId),
        eq(financeCategoryGroups.id, groupId),
      ),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.budgetGroup);
}

async function requireSupplyItem(userId: string, itemId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeSupplyItems.id })
    .from(financeSupplyItems)
    .where(
      and(eq(financeSupplyItems.userId, userId), eq(financeSupplyItems.id, itemId)),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.supplyItem);
}

async function requireSupplyGroup(userId: string, groupId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeSupplyGroups.id })
    .from(financeSupplyGroups)
    .where(
      and(eq(financeSupplyGroups.userId, userId), eq(financeSupplyGroups.id, groupId)),
    )
    .limit(1);
  if (!row) throw new Error(NOT_YOURS.supplyGroup);
}

/** Prove the caller owns what a source refers to, and that a manual one is well-formed. */
async function requireSource(userId: string, source: LineAmountSource): Promise<void> {
  switch (source.type) {
    case "supplyItem":
      return requireSupplyItem(userId, source.supplyItemId);
    case "supplyGroup":
      return requireSupplyGroup(userId, source.supplyGroupId);
    case "manual": {
      if (!Number.isInteger(source.amountCents) || source.amountCents < 0) {
        throw new Error("An amount must be zero or more.");
      }
      const { unit, n } = source.cadence;
      if (
        (unit !== "month" && unit !== "day") ||
        !Number.isInteger(n) ||
        n < 1 ||
        n > 200
      ) {
        throw new Error("That cadence is not one a line can repeat on.");
      }
      return;
    }
    case "none":
      return;
    default:
      // A server action takes whatever the browser sends; an unknown source is refused here
      // rather than reaching `sourceColumns` and writing nothing sensible.
      throw new Error("That is not a source an amount can come from.");
  }
}

async function requireLink(userId: string, link: LineLink): Promise<void> {
  if (link === null) return;
  if ("envelopeId" in link) return requireEnvelope(userId, link.envelopeId);
  return requireBudgetGroup(userId, link.budgetGroupId);
}

function linkColumns(link: LineLink): {
  envelopeId: string | null;
  budgetGroupId: string | null;
} {
  if (link === null) return { envelopeId: null, budgetGroupId: null };
  return "envelopeId" in link
    ? { envelopeId: link.envelopeId, budgetGroupId: null }
    : { envelopeId: null, budgetGroupId: link.budgetGroupId };
}

/** A new scenario starts as "today": live bills and income, no lines. */
const BLANK_LINE_SOURCE: LineAmountSource = {
  type: "manual",
  amountCents: 0,
  cadence: { unit: "month", n: 1 },
};

/* ───────────────────────────── Scenarios ───────────────────────────── */

async function nextScenarioSortKey(
  userId: string,
  executor: Executor,
): Promise<string> {
  const [last] = await executor
    .select({ sortKey: financeScenarios.sortKey })
    .from(financeScenarios)
    .where(eq(financeScenarios.userId, userId))
    .orderBy(desc(financeScenarios.sortKey))
    .limit(1);
  return last ? after(last.sortKey) : first();
}

export async function createScenario(userId: string, name: string): Promise<string> {
  const trimmed = requireName(name, "scenario");
  const [row] = await db
    .insert(financeScenarios)
    .values({ userId, name: trimmed, sortKey: await nextScenarioSortKey(userId, db) })
    .returning({ id: financeScenarios.id });
  if (!row) throw new Error("Could not save that scenario.");
  return row.id;
}

export async function updateScenario(
  userId: string,
  scenarioId: string,
  edit: { name?: string; notes?: string },
): Promise<void> {
  await requireScenario(userId, scenarioId);
  await db
    .update(financeScenarios)
    .set({
      ...(edit.name !== undefined ? { name: requireName(edit.name, "scenario") } : {}),
      ...(edit.notes !== undefined ? { notes: edit.notes } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(financeScenarios.userId, userId), eq(financeScenarios.id, scenarioId)),
    );
}

/** Cascades to its lines and overrides. */
export async function deleteScenario(
  userId: string,
  scenarioId: string,
): Promise<void> {
  await requireScenario(userId, scenarioId);
  await db
    .delete(financeScenarios)
    .where(
      and(eq(financeScenarios.userId, userId), eq(financeScenarios.id, scenarioId)),
    );
}

/**
 * Copy a scenario: its lines (sub-lines re-parented onto the copies), its overrides, and its
 * notes. Supply and actuals links are kept as they are — they point at the caller's own rows,
 * which the copy has the same right to.
 */
export async function duplicateScenario(
  userId: string,
  scenarioId: string,
  name?: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(financeScenarios)
      .where(
        and(eq(financeScenarios.userId, userId), eq(financeScenarios.id, scenarioId)),
      )
      .limit(1);
    if (!source) throw new Error(NOT_YOURS.scenario);

    const [copy] = await tx
      .insert(financeScenarios)
      .values({
        userId,
        name: requireName(name ?? `${source.name} copy`, "scenario"),
        notes: source.notes,
        sortKey: await nextScenarioSortKey(userId, tx),
      })
      .returning({ id: financeScenarios.id });
    if (!copy) throw new Error("Could not copy that scenario.");

    const lines = await tx
      .select()
      .from(financeScenarioLines)
      .where(
        and(
          eq(financeScenarioLines.userId, userId),
          eq(financeScenarioLines.scenarioId, scenarioId),
        ),
      );
    // Parents first, so every child can name the id its parent was given.
    const idMap = new Map<string, string>();
    const pending = [...lines];
    while (pending.length > 0) {
      const ready = pending.filter(
        (line) => line.parentId === null || idMap.has(line.parentId),
      );
      if (ready.length === 0) throw new Error("A scenario's lines contain a cycle.");
      for (const line of ready) {
        const [inserted] = await tx
          .insert(financeScenarioLines)
          .values({
            userId,
            scenarioId: copy.id,
            parentId:
              line.parentId === null ? null : (idMap.get(line.parentId) ?? null),
            kind: line.kind,
            sortKey: line.sortKey,
            name: line.name,
            amountCents: line.amountCents,
            cadenceUnit: line.cadenceUnit,
            cadenceN: line.cadenceN,
            supplyItemId: line.supplyItemId,
            supplyGroupId: line.supplyGroupId,
            envelopeId: line.envelopeId,
            budgetGroupId: line.budgetGroupId,
          })
          .returning({ id: financeScenarioLines.id });
        if (!inserted) throw new Error("Could not copy that scenario.");
        idMap.set(line.id, inserted.id);
        pending.splice(pending.indexOf(line), 1);
      }
    }

    const overrides = await tx
      .select()
      .from(financeScenarioOverrides)
      .where(
        and(
          eq(financeScenarioOverrides.userId, userId),
          eq(financeScenarioOverrides.scenarioId, scenarioId),
        ),
      );
    if (overrides.length > 0) {
      await tx.insert(financeScenarioOverrides).values(
        overrides.map((override) => ({
          userId,
          scenarioId: copy.id,
          envelopeId: override.envelopeId,
          included: override.included,
          monthlyCents: override.monthlyCents,
        })),
      );
    }
    return copy.id;
  });
}

/* ─────────────────────────────── Lines ─────────────────────────────── */

async function siblings(
  userId: string,
  scenarioId: string,
  parentId: string | null,
  executor: Executor,
): Promise<{ id: string; sortKey: string }[]> {
  const rows = await executor
    .select({ id: financeScenarioLines.id, sortKey: financeScenarioLines.sortKey })
    .from(financeScenarioLines)
    .where(
      and(
        eq(financeScenarioLines.userId, userId),
        eq(financeScenarioLines.scenarioId, scenarioId),
        parentId === null
          ? isNull(financeScenarioLines.parentId)
          : eq(financeScenarioLines.parentId, parentId),
      ),
    );
  return rows.sort((a, b) => compare(a.sortKey, b.sortKey));
}

/** A sort key landing after `afterId` among `parentId`'s children, or last when null. */
async function sortKeyAfter(
  userId: string,
  scenarioId: string,
  parentId: string | null,
  afterId: string | null,
  executor: Executor,
  excluding?: string,
): Promise<string> {
  const rows = (await siblings(userId, scenarioId, parentId, executor)).filter(
    (row) => row.id !== excluding,
  );
  if (afterId === null) {
    const last = rows[rows.length - 1];
    return last ? after(last.sortKey) : first();
  }
  const index = rows.findIndex((row) => row.id === afterId);
  if (index === -1) throw new Error(NOT_YOURS.line);
  return between(rows[index].sortKey, rows[index + 1]?.sortKey ?? null);
}

/** A sort key landing just before `beforeId` among `parentId`'s children. */
async function sortKeyBefore(
  userId: string,
  scenarioId: string,
  parentId: string | null,
  beforeId: string,
  executor: Executor,
  excluding?: string,
): Promise<string> {
  const rows = (await siblings(userId, scenarioId, parentId, executor)).filter(
    (row) => row.id !== excluding,
  );
  const index = rows.findIndex((row) => row.id === beforeId);
  if (index === -1) throw new Error(NOT_YOURS.line);
  return between(rows[index - 1]?.sortKey ?? null, rows[index].sortKey);
}

async function hasChildren(
  userId: string,
  lineId: string,
  executor: Executor,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: financeScenarioLines.id })
    .from(financeScenarioLines)
    .where(
      and(
        eq(financeScenarioLines.userId, userId),
        eq(financeScenarioLines.parentId, lineId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Give a leaf its first child's worth of room: its amount moves to a new sub-line and it
 * becomes a roll-up, so the scenario total does not change. Returns the columns the first
 * child must carry, or null when the parent already has children.
 */
async function openRollup(
  userId: string,
  parent: LineRow,
  executor: Executor,
): Promise<LineSourceColumns | null> {
  if (await hasChildren(userId, parent.id, executor)) return null;
  const plan = splitLine(lineSourceOf(parent));
  await executor
    .update(financeScenarioLines)
    .set({ ...plan.parent, updatedAt: new Date() })
    .where(
      and(
        eq(financeScenarioLines.userId, userId),
        eq(financeScenarioLines.id, parent.id),
      ),
    );
  return plan.child;
}

/** A child's columns when its parent had no amount to hand down: a blank manual line. */
function inheritedOrBlank(columns: LineSourceColumns): LineSourceColumns {
  const empty =
    columns.amountCents === null &&
    columns.supplyItemId === null &&
    columns.supplyGroupId === null;
  return empty ? sourceColumns(BLANK_LINE_SOURCE) : columns;
}

export type LineInput = {
  name: string;
  /** Required for a top-level line; a sub-line inherits its parent's. */
  kind?: ScenarioLineKind;
  parentId?: string | null;
  /** Ignored for the first sub-line, which inherits the parent's amount. */
  source?: LineAmountSource;
  link?: LineLink;
  /** Land after this sibling; last when omitted. */
  afterId?: string | null;
};

export async function createLine(
  userId: string,
  scenarioId: string,
  input: LineInput,
): Promise<string> {
  const name = requireName(input.name, "line");
  await requireScenario(userId, scenarioId);
  const source = input.source ?? BLANK_LINE_SOURCE;
  await requireSource(userId, source);
  await requireLink(userId, input.link ?? null);

  return db.transaction(async (tx) => {
    let parent: LineRow | null = null;
    if (input.parentId) {
      parent = await requireLine(userId, input.parentId, tx);
      if (parent.scenarioId !== scenarioId) throw new Error(NOT_YOURS.line);
    }
    const kind = parent?.kind ?? input.kind;
    if (!kind || !SCENARIO_LINE_KINDS.includes(kind)) {
      throw new Error("A line needs to be income or an expense.");
    }
    if (parent && input.kind && input.kind !== parent.kind) {
      throw new Error("A sub-line is the same kind as its parent.");
    }

    const inherited = parent ? await openRollup(userId, parent, tx) : null;
    const columns = inherited ? inheritedOrBlank(inherited) : sourceColumns(source);
    const sortKey = await sortKeyAfter(
      userId,
      scenarioId,
      parent?.id ?? null,
      input.afterId ?? null,
      tx,
    );

    const [row] = await tx
      .insert(financeScenarioLines)
      .values({
        userId,
        scenarioId,
        parentId: parent?.id ?? null,
        kind,
        sortKey,
        name,
        ...columns,
        ...linkColumns(input.link ?? null),
      })
      .returning({ id: financeScenarioLines.id });
    if (!row) throw new Error("Could not save that line.");
    return row.id;
  });
}

export type LineEdit = {
  name?: string;
  source?: LineAmountSource;
  /** `null` clears the link; omit to leave it. */
  link?: LineLink;
};

export async function updateLine(
  userId: string,
  lineId: string,
  edit: LineEdit,
): Promise<void> {
  const line = await requireLine(userId, lineId);
  if (edit.source !== undefined) {
    await requireSource(userId, edit.source);
    if (await hasChildren(userId, lineId, db)) {
      throw new Error("A line with sub-lines has no amount of its own.");
    }
  }
  if (edit.link !== undefined) await requireLink(userId, edit.link);

  await db
    .update(financeScenarioLines)
    .set({
      ...(edit.name !== undefined ? { name: requireName(edit.name, "line") } : {}),
      ...(edit.source !== undefined ? sourceColumns(edit.source) : {}),
      ...(edit.link !== undefined ? linkColumns(edit.link) : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financeScenarioLines.userId, userId),
        eq(financeScenarioLines.id, line.id),
      ),
    );
}

/** Cascades to its sub-lines. */
export async function deleteLine(userId: string, lineId: string): Promise<void> {
  await requireLine(userId, lineId);
  await db
    .delete(financeScenarioLines)
    .where(
      and(eq(financeScenarioLines.userId, userId), eq(financeScenarioLines.id, lineId)),
    );
}

/** Whether `candidateId` is `lineId` or sits beneath it — a line cannot move into itself. */
async function isSelfOrDescendant(
  userId: string,
  lineId: string,
  candidateId: string,
  executor: Executor,
): Promise<boolean> {
  let cursor: string | null = candidateId;
  for (let hops = 0; cursor !== null && hops < 1000; hops++) {
    if (cursor === lineId) return true;
    const [row] = await executor
      .select({ parentId: financeScenarioLines.parentId })
      .from(financeScenarioLines)
      .where(
        and(
          eq(financeScenarioLines.userId, userId),
          eq(financeScenarioLines.id, cursor),
        ),
      )
      .limit(1);
    cursor = row?.parentId ?? null;
  }
  return false;
}

/**
 * Reorder a line, or move it under another. A new parent must be in the same scenario and
 * the same section (the composite foreign key refuses anything else), and a leaf that
 * receives its first child hands its amount down exactly as `createLine` does.
 */
export async function moveLine(
  userId: string,
  lineId: string,
  to: { parentId: string | null; afterId?: string | null; beforeId?: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const line = await requireLine(userId, lineId, tx);
    let parent: LineRow | null = null;
    if (to.parentId !== null) {
      parent = await requireLine(userId, to.parentId, tx);
      if (parent.scenarioId !== line.scenarioId) throw new Error(NOT_YOURS.line);
      if (parent.kind !== line.kind) {
        throw new Error("A sub-line is the same kind as its parent.");
      }
      if (await isSelfOrDescendant(userId, lineId, parent.id, tx)) {
        throw new Error("A line cannot move beneath itself.");
      }
    }
    for (const siblingId of [to.afterId, to.beforeId]) {
      if (!siblingId) continue;
      const sibling = await requireLine(userId, siblingId, tx);
      if ((sibling.parentId ?? null) !== (parent?.id ?? null)) {
        throw new Error(NOT_YOURS.line);
      }
    }

    if (parent && parent.id !== line.parentId) {
      // A leaf with an amount keeps it: the amount moves onto a new sub-line named for the
      // parent, so moving a line beneath it does not silently drop what the parent was worth.
      const inherited = await openRollup(userId, parent, tx);
      const carries =
        inherited !== null &&
        (inherited.supplyItemId !== null ||
          inherited.supplyGroupId !== null ||
          (inherited.amountCents ?? 0) > 0);
      if (inherited && carries) {
        await tx.insert(financeScenarioLines).values({
          userId,
          scenarioId: parent.scenarioId,
          parentId: parent.id,
          kind: parent.kind,
          sortKey: first(),
          name: parent.name,
          ...inherited,
          envelopeId: null,
          budgetGroupId: null,
        });
      }
    }

    const sortKey = to.beforeId
      ? await sortKeyBefore(
          userId,
          line.scenarioId,
          parent?.id ?? null,
          to.beforeId,
          tx,
          line.id,
        )
      : await sortKeyAfter(
          userId,
          line.scenarioId,
          parent?.id ?? null,
          to.afterId ?? null,
          tx,
          line.id,
        );
    await tx
      .update(financeScenarioLines)
      .set({ parentId: parent?.id ?? null, sortKey, updatedAt: new Date() })
      .where(
        and(
          eq(financeScenarioLines.userId, userId),
          eq(financeScenarioLines.id, line.id),
        ),
      );
  });
}

/* ───────────────────────────── Overrides ───────────────────────────── */

/**
 * Switch a bill or Regular income on or off for this scenario, optionally replacing its
 * monthly amount. `monthlyCents: null` keeps the live figure.
 */
export async function setOverride(
  userId: string,
  scenarioId: string,
  envelopeId: string,
  value: { included: boolean; monthlyCents?: number | null },
): Promise<void> {
  await requireScenario(userId, scenarioId);
  await requireEnvelope(userId, envelopeId, ["bill", "income"]);
  const monthlyCents = value.monthlyCents ?? null;
  if (monthlyCents !== null && (!Number.isInteger(monthlyCents) || monthlyCents < 0)) {
    throw new Error("An amount must be zero or more.");
  }
  await db
    .insert(financeScenarioOverrides)
    .values({ userId, scenarioId, envelopeId, included: value.included, monthlyCents })
    .onConflictDoUpdate({
      target: [
        financeScenarioOverrides.scenarioId,
        financeScenarioOverrides.envelopeId,
      ],
      set: { included: value.included, monthlyCents, updatedAt: new Date() },
      // The conflict key is (scenario, envelope); the caller's own scenario was proven above.
      setWhere: eq(financeScenarioOverrides.userId, userId),
    });
}

/** Back to "as it is today". */
export async function clearOverride(
  userId: string,
  scenarioId: string,
  envelopeId: string,
): Promise<void> {
  await requireScenario(userId, scenarioId);
  await db
    .delete(financeScenarioOverrides)
    .where(
      and(
        eq(financeScenarioOverrides.userId, userId),
        eq(financeScenarioOverrides.scenarioId, scenarioId),
        eq(financeScenarioOverrides.envelopeId, envelopeId),
      ),
    );
}

/* ──────────────────────────────── Seed ─────────────────────────────── */

/**
 * Add the proposed lines from last year's spending. Takes already-computed `SeedLine`s, so
 * the caller (`workspace.ts`) is the one place that decides what "uncovered" means; this only
 * proves each envelope is the caller's and writes. All or nothing, in one transaction.
 */
export async function addSeedLines(
  userId: string,
  scenarioId: string,
  lines: readonly SeedLine[],
): Promise<number> {
  await requireScenario(userId, scenarioId);
  if (lines.length === 0) return 0;
  const envelopeIds = [...new Set(lines.map((line) => line.envelopeId))];
  const owned = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        inArray(financeBudgetCategories.id, envelopeIds),
      ),
    );
  if (owned.length !== envelopeIds.length) throw new Error(NOT_YOURS.envelope);

  return db.transaction(async (tx) => {
    let afterId: string | null = null;
    for (const line of lines) {
      if (!Number.isInteger(line.amountCents) || line.amountCents < 0) {
        throw new Error("An amount must be zero or more.");
      }
      const sortKey = await sortKeyAfter(userId, scenarioId, null, afterId, tx);
      const [row] = await tx
        .insert(financeScenarioLines)
        .values({
          userId,
          scenarioId,
          parentId: null,
          kind: "expense",
          sortKey,
          name: requireName(line.name, "line"),
          ...sourceColumns({
            type: "manual",
            amountCents: line.amountCents,
            cadence: { unit: "month", n: 1 },
          }),
          envelopeId: line.envelopeId,
          budgetGroupId: null,
        })
        .returning({ id: financeScenarioLines.id });
      if (!row) throw new Error("Could not save that line.");
      afterId = row.id;
    }
    return lines.length;
  });
}
