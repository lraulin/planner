import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financeScenarioLines,
  financeScenarioOverrides,
  financeScenarios,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createBudgetCategory,
  createCategoryGroup,
  updateBudgetCategory,
} from "@/lib/finances/budget/mutations";
import {
  createSupplyGroup,
  createSupplyItem,
  deleteSupplyItem,
} from "../supplies/mutations";
import { composeScenario } from "./compose";
import {
  addSeedLines,
  clearOverride,
  createLine,
  createScenario,
  deleteLine,
  deleteScenario,
  duplicateScenario,
  moveLine,
  setOverride,
  updateLine,
  updateScenario,
} from "./mutations";
import { listScenarios, loadAllScenarios, loadScenario } from "./queries";
import type { LineAmountSource } from "./amount";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("scenario mutations");

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `scenarios-${label}-${crypto.randomUUID()}@example.com`,
      name: label,
    })
    .returning({ id: users.id });
  return row.id;
}

const monthly = (amountCents: number): LineAmountSource => ({
  type: "manual",
  amountCents,
  cadence: { unit: "month", n: 1 },
});

async function lineTotal(userId: string, scenarioId: string): Promise<number> {
  const records = await loadScenario(userId, scenarioId);
  if (!records) throw new Error("missing scenario");
  return composeScenario({
    bills: [],
    income: [],
    overrides: [],
    lines: records.lines,
    supply: { itemMonthlyCents: new Map(), groupMonthlyCents: new Map() },
    actuals: { byEnvelope: new Map(), byGroup: new Map() },
    billActuals: new Map(),
  }).linesCents;
}

describeDb("scenario worksheet", () => {
  let owner = "";
  let intruder = "";

  beforeEach(async () => {
    owner = await makeUser("owner");
    intruder = await makeUser("intruder");
  });

  afterEach(async () => {
    if (owner) await db.delete(users).where(eq(users.id, owner));
    if (intruder) await db.delete(users).where(eq(users.id, intruder));
  });

  describe("scenarios", () => {
    it("creates, renames and lists scenarios in order", async () => {
      const a = await createScenario(owner, "Today");
      const b = await createScenario(owner, "  After closing ");
      await updateScenario(owner, a, { name: "Now", notes: "before the move" });
      const listed = await listScenarios(owner);
      expect(listed.map((row) => row.name)).toEqual(["Now", "After closing"]);
      expect(listed[0].notes).toBe("before the move");
      expect(b).not.toBe(a);
    });

    it("refuses a blank name", async () => {
      await expect(createScenario(owner, "  ")).rejects.toThrow(
        "A scenario needs a name.",
      );
      const id = await createScenario(owner, "Today");
      await expect(updateScenario(owner, id, { name: "" })).rejects.toThrow(
        "A scenario needs a name.",
      );
    });

    it("duplicates lines, sub-lines and overrides onto the copy", async () => {
      const bill = await createBudgetCategory(owner, { name: "Rent", kind: "bill" });
      const id = await createScenario(owner, "After closing");
      await setOverride(owner, id, bill, { included: false });
      const food = await createLine(owner, id, {
        name: "Food",
        kind: "expense",
        source: monthly(40000),
      });
      await createLine(owner, id, { name: "Milk", parentId: food });
      await createLine(owner, id, {
        name: "Beef",
        parentId: food,
        source: monthly(6000),
      });

      const copyId = await duplicateScenario(owner, id);
      expect((await listScenarios(owner)).map((row) => row.name)).toEqual([
        "After closing",
        "After closing copy",
      ]);
      const copy = await loadScenario(owner, copyId);
      const original = await loadScenario(owner, id);
      expect(copy?.overrides).toEqual(original?.overrides);
      expect(copy?.lines).toHaveLength(3);
      expect(
        copy?.lines.every((line) => !original?.lines.some((o) => o.id === line.id)),
      ).toBe(true);
      expect(await lineTotal(owner, copyId)).toBe(await lineTotal(owner, id));

      // The copy is independent: editing it leaves the original alone.
      await deleteScenario(owner, copyId);
      expect(await lineTotal(owner, id)).toBe(46000);
    });

    it("deletes a scenario with its lines and overrides", async () => {
      const bill = await createBudgetCategory(owner, { name: "Rent", kind: "bill" });
      const id = await createScenario(owner, "Today");
      await createLine(owner, id, { name: "Food", kind: "expense" });
      await setOverride(owner, id, bill, { included: false });
      await deleteScenario(owner, id);
      expect(await loadScenario(owner, id)).toBeNull();
      expect(
        await db
          .select({ id: financeScenarioLines.id })
          .from(financeScenarioLines)
          .where(eq(financeScenarioLines.userId, owner)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: financeScenarioOverrides.id })
          .from(financeScenarioOverrides)
          .where(eq(financeScenarioOverrides.userId, owner)),
      ).toEqual([]);
    });
  });

  describe("lines", () => {
    it("keeps the total when the first sub-line is added to a $250 line", async () => {
      const id = await createScenario(owner, "Today");
      const gas = await createLine(owner, id, {
        name: "Gas",
        kind: "expense",
        source: monthly(25000),
      });
      expect(await lineTotal(owner, id)).toBe(25000);

      const fuel = await createLine(owner, id, { name: "Fuel", parentId: gas });
      expect(await lineTotal(owner, id)).toBe(25000);

      // The parent no longer carries an amount of its own; the first child does.
      const records = await loadScenario(owner, id);
      expect(records?.lines.find((line) => line.id === gas)?.source).toEqual({
        type: "none",
      });
      expect(records?.lines.find((line) => line.id === fuel)?.source).toEqual(
        monthly(25000),
      );

      // The second sub-line starts blank and the total still holds.
      await createLine(owner, id, { name: "Tolls", parentId: gas });
      expect(await lineTotal(owner, id)).toBe(25000);
    });

    it("hands a supply source down to the first sub-line", async () => {
      const group = await createSupplyGroup(owner, "Pets");
      const id = await createScenario(owner, "Today");
      const pets = await createLine(owner, id, {
        name: "Pets",
        kind: "expense",
        source: { type: "supplyGroup", supplyGroupId: group },
      });
      const food = await createLine(owner, id, { name: "Food", parentId: pets });
      const records = await loadScenario(owner, id);
      expect(records?.lines.find((line) => line.id === food)?.source).toEqual({
        type: "supplyGroup",
        supplyGroupId: group,
      });
    });

    it("gives a sub-line its parent's kind and refuses a different one", async () => {
      const id = await createScenario(owner, "Today");
      const side = await createLine(owner, id, { name: "Side work", kind: "income" });
      const sub = await createLine(owner, id, { name: "Tips", parentId: side });
      const records = await loadScenario(owner, id);
      expect(records?.lines.find((line) => line.id === sub)?.kind).toBe("income");
      await expect(
        createLine(owner, id, { name: "Bad", parentId: side, kind: "expense" }),
      ).rejects.toThrow("A sub-line is the same kind as its parent.");
      await expect(createLine(owner, id, { name: "No kind" })).rejects.toThrow(
        "A line needs to be income or an expense.",
      );
    });

    it("refuses an amount on a roll-up and a malformed manual source", async () => {
      const id = await createScenario(owner, "Today");
      const food = await createLine(owner, id, {
        name: "Food",
        kind: "expense",
        source: monthly(1000),
      });
      await createLine(owner, id, { name: "Milk", parentId: food });
      await expect(updateLine(owner, food, { source: monthly(5000) })).rejects.toThrow(
        "A line with sub-lines has no amount of its own.",
      );
      const loose = await createLine(owner, id, { name: "Loose", kind: "expense" });
      await expect(updateLine(owner, loose, { source: monthly(-1) })).rejects.toThrow(
        "An amount must be zero or more.",
      );
      await expect(
        updateLine(owner, loose, {
          source: { type: "manual", amountCents: 1, cadence: { unit: "day", n: 0 } },
        }),
      ).rejects.toThrow("That cadence is not one a line can repeat on.");
    });

    it("links to an envelope or a budget group, and one replaces the other", async () => {
      const envelope = await createBudgetCategory(owner, { name: "Groceries" });
      const group = await createCategoryGroup(owner, {
        name: "Food",
        kind: "spending",
      });
      const id = await createScenario(owner, "Today");
      const line = await createLine(owner, id, {
        name: "Food",
        kind: "expense",
        link: { envelopeId: envelope },
      });
      await updateLine(owner, line, { link: { budgetGroupId: group } });
      const [row] = await db
        .select()
        .from(financeScenarioLines)
        .where(eq(financeScenarioLines.id, line));
      expect(row.envelopeId).toBeNull();
      expect(row.budgetGroupId).toBe(group);
      await updateLine(owner, line, { link: null });
      const [cleared] = await db
        .select()
        .from(financeScenarioLines)
        .where(eq(financeScenarioLines.id, line));
      expect(cleared.budgetGroupId).toBeNull();
    });

    it("moves a line under another and keeps what the new parent was worth", async () => {
      const id = await createScenario(owner, "Today");
      const car = await createLine(owner, id, {
        name: "Car",
        kind: "expense",
        source: monthly(30000),
      });
      const wash = await createLine(owner, id, {
        name: "Wash",
        kind: "expense",
        source: monthly(2000),
      });
      expect(await lineTotal(owner, id)).toBe(32000);
      await moveLine(owner, wash, { parentId: car });
      // Car's own $300 moved onto a sub-line, wash rides along with its own $20.
      expect(await lineTotal(owner, id)).toBe(32000);
      const records = await loadScenario(owner, id);
      expect(records?.lines.filter((line) => line.parentId === car)).toHaveLength(2);
    });

    it("reorders among siblings", async () => {
      const id = await createScenario(owner, "Today");
      const a = await createLine(owner, id, { name: "A", kind: "expense" });
      const b = await createLine(owner, id, { name: "B", kind: "expense" });
      const c = await createLine(owner, id, { name: "C", kind: "expense" });
      await moveLine(owner, c, { parentId: null, afterId: null });
      await moveLine(owner, a, { parentId: null, afterId: b });
      const order = (await loadScenario(owner, id))?.lines
        .sort((x, y) => (x.sortKey < y.sortKey ? -1 : 1))
        .map((line) => line.name);
      expect(order).toEqual(["B", "A", "C"]);

      // Before the first sibling, which "after" alone cannot express.
      await moveLine(owner, c, { parentId: null, beforeId: b });
      const first = (await loadScenario(owner, id))?.lines
        .sort((x, y) => (x.sortKey < y.sortKey ? -1 : 1))
        .map((line) => line.name);
      expect(first).toEqual(["C", "B", "A"]);
    });

    it("refuses to move a line beneath itself or under another section", async () => {
      const id = await createScenario(owner, "Today");
      const parent = await createLine(owner, id, { name: "P", kind: "expense" });
      const child = await createLine(owner, id, { name: "C", parentId: parent });
      await expect(moveLine(owner, parent, { parentId: child })).rejects.toThrow(
        "A line cannot move beneath itself.",
      );
      await expect(moveLine(owner, parent, { parentId: parent })).rejects.toThrow(
        "A line cannot move beneath itself.",
      );
      const income = await createLine(owner, id, { name: "I", kind: "income" });
      await expect(moveLine(owner, parent, { parentId: income })).rejects.toThrow(
        "A sub-line is the same kind as its parent.",
      );
    });

    it("deletes a line with its sub-lines", async () => {
      const id = await createScenario(owner, "Today");
      const parent = await createLine(owner, id, {
        name: "P",
        kind: "expense",
        source: monthly(100),
      });
      await createLine(owner, id, { name: "C", parentId: parent });
      await deleteLine(owner, parent);
      expect((await loadScenario(owner, id))?.lines).toEqual([]);
    });

    it("leaves a line source-less, not deleted, when its supply item goes", async () => {
      const item = await createSupplyItem(owner, {
        name: "Paper towels",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
      });
      const id = await createScenario(owner, "Today");
      const line = await createLine(owner, id, {
        name: "Towels",
        kind: "expense",
        source: { type: "supplyItem", supplyItemId: item },
      });
      await deleteSupplyItem(owner, item);
      const records = await loadScenario(owner, id);
      expect(records?.lines.find((row) => row.id === line)?.source).toEqual({
        type: "none",
      });
    });
  });

  describe("overrides", () => {
    it("upserts one override per envelope and clears it back to as-is", async () => {
      const bill = await createBudgetCategory(owner, { name: "Rent", kind: "bill" });
      const id = await createScenario(owner, "Today");
      await setOverride(owner, id, bill, { included: false });
      await setOverride(owner, id, bill, { included: true, monthlyCents: 15000 });
      expect((await loadScenario(owner, id))?.overrides).toEqual([
        { envelopeId: bill, included: true, monthlyCents: 15000 },
      ]);
      await clearOverride(owner, id, bill);
      expect((await loadScenario(owner, id))?.overrides).toEqual([]);
    });

    it("accepts Regular income and refuses an ordinary envelope", async () => {
      const income = await createBudgetCategory(owner, { name: "Pay", kind: "income" });
      await updateBudgetCategory(owner, income, {
        incomeRole: "regular",
        expectedMonthlyIncomeCents: 100000,
      });
      const groceries = await createBudgetCategory(owner, { name: "Groceries" });
      const id = await createScenario(owner, "Today");
      await setOverride(owner, id, income, { included: true, monthlyCents: 90000 });
      await expect(
        setOverride(owner, id, groceries, { included: false }),
      ).rejects.toThrow("Only a bill or a Regular income envelope can be overridden.");
    });

    it("refuses a negative or fractional amount", async () => {
      const bill = await createBudgetCategory(owner, { name: "Rent", kind: "bill" });
      const id = await createScenario(owner, "Today");
      await expect(
        setOverride(owner, id, bill, { included: true, monthlyCents: -1 }),
      ).rejects.toThrow("An amount must be zero or more.");
      await expect(
        setOverride(owner, id, bill, { included: true, monthlyCents: 1.5 }),
      ).rejects.toThrow("An amount must be zero or more.");
    });
  });

  describe("seeding", () => {
    it("adds one linked monthly line per proposal, in order", async () => {
      const groceries = await createBudgetCategory(owner, { name: "Groceries" });
      const fun = await createBudgetCategory(owner, { name: "Fun" });
      const id = await createScenario(owner, "Today");
      const added = await addSeedLines(owner, id, [
        { name: "Groceries", amountCents: 61000, envelopeId: groceries },
        { name: "Fun", amountCents: 9000, envelopeId: fun },
      ]);
      expect(added).toBe(2);
      const records = await loadScenario(owner, id);
      const lines = records?.lines.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
      expect(lines?.map((line) => [line.name, line.envelopeId])).toEqual([
        ["Groceries", groceries],
        ["Fun", fun],
      ]);
      expect(await lineTotal(owner, id)).toBe(70000);
    });
  });

  describe("constraints the schema holds on its own", () => {
    it("refuses a line with two sources, or a half-stated manual one", async () => {
      const id = await createScenario(owner, "Today");
      const item = await createSupplyItem(owner, {
        name: "Towels",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
      });
      const base = {
        userId: owner,
        scenarioId: id,
        kind: "expense" as const,
        sortKey: "a",
        name: "Bad",
      };
      await expect(
        db.insert(financeScenarioLines).values({
          ...base,
          amountCents: 100,
          cadenceUnit: "month",
          cadenceN: 1,
          supplyItemId: item,
        }),
      ).rejects.toThrow();
      await expect(
        db.insert(financeScenarioLines).values({ ...base, amountCents: 100 }),
      ).rejects.toThrow();
    });

    it("refuses a parent from another scenario, or a sub-line of another section", async () => {
      const one = await createScenario(owner, "One");
      const two = await createScenario(owner, "Two");
      const parent = await createLine(owner, one, { name: "P", kind: "expense" });
      const common = {
        userId: owner,
        sortKey: "a",
        name: "Child",
        ...{ amountCents: 0, cadenceUnit: "month" as const, cadenceN: 1 },
      };
      await expect(
        db.insert(financeScenarioLines).values({
          ...common,
          scenarioId: two,
          parentId: parent,
          kind: "expense",
        }),
      ).rejects.toThrow();
      await expect(
        db.insert(financeScenarioLines).values({
          ...common,
          scenarioId: one,
          parentId: parent,
          kind: "income",
        }),
      ).rejects.toThrow();
    });

    it("refuses a line or override filed under another user's scenario", async () => {
      const theirs = await createScenario(owner, "Theirs");
      const bill = await createBudgetCategory(intruder, { name: "Rent", kind: "bill" });
      await expect(
        db.insert(financeScenarioLines).values({
          userId: intruder,
          scenarioId: theirs,
          kind: "expense",
          sortKey: "a",
          name: "Smuggled",
        }),
      ).rejects.toThrow();
      await expect(
        db.insert(financeScenarioOverrides).values({
          userId: intruder,
          scenarioId: theirs,
          envelopeId: bill,
        }),
      ).rejects.toThrow();
    });

    it("refuses a line linked to both an envelope and a budget group", async () => {
      const id = await createScenario(owner, "Today");
      const envelope = await createBudgetCategory(owner, { name: "Groceries" });
      const group = await createCategoryGroup(owner, {
        name: "Food",
        kind: "spending",
      });
      await expect(
        db.insert(financeScenarioLines).values({
          userId: owner,
          scenarioId: id,
          kind: "expense",
          sortKey: "a",
          name: "Both",
          envelopeId: envelope,
          budgetGroupId: group,
        }),
      ).rejects.toThrow();
    });
  });

  describe("user isolation", () => {
    let scenarioId = "";
    let lineId = "";
    let billId = "";

    beforeEach(async () => {
      billId = await createBudgetCategory(owner, { name: "Rent", kind: "bill" });
      scenarioId = await createScenario(owner, "Mine");
      lineId = await createLine(owner, scenarioId, {
        name: "Food",
        kind: "expense",
        source: monthly(40000),
      });
      await setOverride(owner, scenarioId, billId, { included: false });
    });

    async function ownerIntact() {
      const records = await loadScenario(owner, scenarioId);
      expect(records?.scenario.name).toBe("Mine");
      expect(records?.lines.map((line) => line.name)).toEqual(["Food"]);
      expect(records?.overrides).toEqual([
        { envelopeId: billId, included: false, monthlyCents: null },
      ]);
    }

    it("cannot read another user's scenario, and sees none of its rows in a listing", async () => {
      expect(await loadScenario(intruder, scenarioId)).toBeNull();
      expect(await listScenarios(intruder)).toEqual([]);
      expect(await loadAllScenarios(intruder)).toEqual([]);
    });

    it("cannot change, copy or delete another user's scenario", async () => {
      await expect(
        updateScenario(intruder, scenarioId, { name: "Stolen" }),
      ).rejects.toThrow("That scenario does not exist.");
      await expect(duplicateScenario(intruder, scenarioId)).rejects.toThrow(
        "That scenario does not exist.",
      );
      await expect(deleteScenario(intruder, scenarioId)).rejects.toThrow(
        "That scenario does not exist.",
      );
      await ownerIntact();
      expect(await listScenarios(intruder)).toEqual([]);
    });

    it("cannot add to, change, move or delete another user's lines", async () => {
      await expect(
        createLine(intruder, scenarioId, { name: "Smuggled", kind: "expense" }),
      ).rejects.toThrow("That scenario does not exist.");
      await expect(updateLine(intruder, lineId, { name: "Stolen" })).rejects.toThrow(
        "That line does not exist.",
      );
      await expect(moveLine(intruder, lineId, { parentId: null })).rejects.toThrow(
        "That line does not exist.",
      );
      await expect(deleteLine(intruder, lineId)).rejects.toThrow(
        "That line does not exist.",
      );
      const own = await createScenario(intruder, "Theirs");
      await expect(
        createLine(intruder, own, { name: "Under", parentId: lineId }),
      ).rejects.toThrow("That line does not exist.");
      const mine = await createLine(intruder, own, { name: "Mine", kind: "expense" });
      await expect(moveLine(intruder, mine, { parentId: lineId })).rejects.toThrow(
        "That line does not exist.",
      );
      await ownerIntact();
    });

    it("cannot set or clear another user's overrides", async () => {
      await expect(
        setOverride(intruder, scenarioId, billId, { included: true }),
      ).rejects.toThrow("That scenario does not exist.");
      await expect(clearOverride(intruder, scenarioId, billId)).rejects.toThrow(
        "That scenario does not exist.",
      );
      // Their own scenario, but the owner's envelope.
      const own = await createScenario(intruder, "Theirs");
      await expect(
        setOverride(intruder, own, billId, { included: false }),
      ).rejects.toThrow("That envelope does not exist.");
      await ownerIntact();
    });

    it("cannot attach a line to another user's envelope, budget group, supply item or group", async () => {
      const group = await createCategoryGroup(owner, {
        name: "Food",
        kind: "spending",
      });
      const item = await createSupplyItem(owner, {
        name: "Towels",
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
      });
      const supplyGroup = await createSupplyGroup(owner, "Pets");
      const own = await createScenario(intruder, "Theirs");
      const mine = await createLine(intruder, own, { name: "Mine", kind: "expense" });

      const attempts: (() => Promise<unknown>)[] = [
        () =>
          createLine(intruder, own, {
            name: "x",
            kind: "expense",
            link: { envelopeId: billId },
          }),
        () =>
          createLine(intruder, own, {
            name: "x",
            kind: "expense",
            link: { budgetGroupId: group },
          }),
        () =>
          createLine(intruder, own, {
            name: "x",
            kind: "expense",
            source: { type: "supplyItem", supplyItemId: item },
          }),
        () =>
          createLine(intruder, own, {
            name: "x",
            kind: "expense",
            source: { type: "supplyGroup", supplyGroupId: supplyGroup },
          }),
        () => updateLine(intruder, mine, { link: { envelopeId: billId } }),
        () => updateLine(intruder, mine, { link: { budgetGroupId: group } }),
        () =>
          updateLine(intruder, mine, {
            source: { type: "supplyItem", supplyItemId: item },
          }),
        () =>
          updateLine(intruder, mine, {
            source: { type: "supplyGroup", supplyGroupId: supplyGroup },
          }),
        () =>
          addSeedLines(intruder, own, [
            { name: "x", amountCents: 1, envelopeId: billId },
          ]),
      ];
      for (const attempt of attempts)
        await expect(attempt).rejects.toThrow("does not exist.");

      const rows = await db
        .select()
        .from(financeScenarioLines)
        .where(eq(financeScenarioLines.userId, intruder));
      expect(rows.map((row) => row.name)).toEqual(["Mine"]);
      expect(rows[0].envelopeId).toBeNull();
      await ownerIntact();
    });

    it("never moves the owner's envelope or scenario rows", async () => {
      const [envelope] = await db
        .select({ name: financeBudgetCategories.name })
        .from(financeBudgetCategories)
        .where(
          and(
            eq(financeBudgetCategories.userId, owner),
            eq(financeBudgetCategories.id, billId),
          ),
        );
      expect(envelope.name).toBe("Rent");
      const scenarios = await db
        .select({ id: financeScenarios.id })
        .from(financeScenarios)
        .where(eq(financeScenarios.userId, owner));
      expect(scenarios).toHaveLength(1);
    });
  });
});
