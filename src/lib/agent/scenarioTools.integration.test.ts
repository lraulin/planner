import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeBudgetCategories, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createBudgetCategory,
  updateBudgetCategory,
} from "@/lib/finances/budget/mutations";
import {
  createLine,
  createScenario,
  setOverride,
} from "@/lib/finances/scenarios/mutations";
import {
  loadScenarioDetail,
  loadScenarioSummaries,
} from "@/lib/finances/scenarios/workspace";
import { outputSchemas } from "./contracts";
import { dispatchAgentTool } from "./tools";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("scenario agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `scenarios-agent-${crypto.randomUUID()}@localhost`,
      name: "Scenarios Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

async function seed(userId: string) {
  const pay = await createBudgetCategory(userId, { name: "Pay", kind: "income" });
  await updateBudgetCategory(userId, pay, {
    incomeRole: "regular",
    expectedMonthlyIncomeCents: 480286,
  });
  const rent = await createBudgetCategory(userId, { name: "Rent", kind: "bill" });
  await db
    .update(financeBudgetCategories)
    .set({ expectedCents: 210000, cadenceMonths: 1 })
    .where(eq(financeBudgetCategories.id, rent));
  const scenarioId = await createScenario(userId, "After closing");
  await setOverride(userId, scenarioId, rent, { included: false });
  await createLine(userId, scenarioId, {
    name: "Mortgage",
    kind: "expense",
    source: { type: "manual", amountCents: 242900, cadence: { unit: "month", n: 1 } },
  });
  return { scenarioId, rent };
}

type Detail = {
  totals: { remainderCents: number; expenseCents: number };
  bills: { name: string; included: boolean }[];
  lines: { name: string; monthlyCents: number; source: string }[];
};

describeDb("scenario agent tools", () => {
  it("lists scenarios and reads one, with the remainder the page computes", async () => {
    const userId = await makeUser();
    const { scenarioId } = await seed(userId);

    const listed = (await dispatchAgentTool("list_scenarios", {}, userId)) as {
      scenarios: { id: string; name: string; remainderCents: number }[];
      pageInfo: { total: number };
    };
    expect(outputSchemas.list_scenarios.safeParse(listed).success).toBe(true);
    expect(listed.scenarios.map((row) => row.name)).toEqual(["After closing"]);
    expect(listed.pageInfo.total).toBe(1);

    const detail = (await dispatchAgentTool(
      "get_scenario",
      { id: scenarioId },
      userId,
    )) as Detail;
    expect(outputSchemas.get_scenario.safeParse(detail).success).toBe(true);

    // The page's own loaders are the reference.
    const page = await loadScenarioDetail(userId, scenarioId);
    const [summary] = await loadScenarioSummaries(userId);
    expect(detail.totals.remainderCents).toBe(page?.composition.remainderCents);
    expect(listed.scenarios[0].remainderCents).toBe(summary.remainderCents);
    expect(detail.totals.remainderCents).toBe(480286 - 242900);
    expect(detail.bills).toMatchObject([{ name: "Rent", included: false }]);
    expect(detail.lines).toMatchObject([
      { name: "Mortgage", monthlyCents: 242900, source: "manual" },
    ]);
  });

  it("does not show a second user the first user's scenarios, or let them read one", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const { scenarioId } = await seed(owner);

    const listed = (await dispatchAgentTool("list_scenarios", {}, other)) as {
      scenarios: unknown[];
    };
    expect(listed.scenarios).toEqual([]);
    await expect(
      dispatchAgentTool("get_scenario", { id: scenarioId }, other),
    ).rejects.toMatchObject({ code: "not_found" });
    // A missing id answers identically to a foreign one.
    await expect(
      dispatchAgentTool("get_scenario", { id: crypto.randomUUID() }, owner),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects fields the tools do not define", async () => {
    const userId = await makeUser();
    const { scenarioId } = await seed(userId);
    await expect(
      dispatchAgentTool("get_scenario", { id: scenarioId, extra: true }, userId),
    ).rejects.toBeDefined();
    await expect(
      dispatchAgentTool("list_scenarios", { name: "x" }, userId),
    ).rejects.toBeDefined();
  });

  it("has no write tools", async () => {
    const userId = await makeUser();
    await expect(
      dispatchAgentTool("create_scenario", { name: "x" }, userId),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
