import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { dispatchAgentTool } from "./tools";

/**
 * Corrections to a declared bill through the agent tools. The bug these pin: a
 * `save_subscription` carrying only `{ name, status }` rewrote the cadence to the monthly
 * default, so cancelling a 30-day payment plan silently made it calendar-monthly — and the
 * result was then found again by name, which a rename or a duplicate name defeats.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("bill agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `bill-agent-${crypto.randomUUID()}@localhost`,
      name: "Bill Agent",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type SavedBill = {
  id: string;
  name: string;
  status: "active" | "paused" | "cancelled";
  cancelledOn: string | null;
  cadence: string;
};

async function save(userId: string, args: Record<string, unknown>): Promise<SavedBill> {
  return (await dispatchAgentTool("save_subscription", args, userId)) as SavedBill;
}

describeDb("save_subscription corrections", () => {
  let ownerId: string;
  let intruderId: string;
  let plan: SavedBill;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    plan = await save(ownerId, {
      name: "Payment Plan",
      cadenceDays: 30,
      expectedCents: 5000,
    });
  });

  it("keeps a day cadence when only the status changes", async () => {
    expect(plan.cadence).not.toBe("Monthly");

    const byName = await save(ownerId, { name: "Payment Plan", status: "paused" });
    expect(byName).toMatchObject({
      id: plan.id,
      status: "paused",
      cadence: plan.cadence,
    });

    const byId = await save(ownerId, { id: plan.id, status: "cancelled" });
    expect(byId).toMatchObject({
      id: plan.id,
      status: "cancelled",
      cadence: plan.cadence,
    });
  });

  it("still changes the cadence when one is given", async () => {
    const monthly = await save(ownerId, { id: plan.id, cadenceMonths: 1 });
    expect(monthly.cadence).toBe("Monthly");
  });

  it("refuses cadenceDays: null without the month cadence replacing it", async () => {
    await expect(
      save(ownerId, { id: plan.id, cadenceDays: null }),
    ).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("renames by id and answers with the renamed row", async () => {
    const renamed = await save(ownerId, { id: plan.id, name: "MedStar Plan" });
    expect(renamed).toMatchObject({
      id: plan.id,
      name: "MedStar Plan",
      cadence: plan.cadence,
    });

    const found = (await dispatchAgentTool(
      "search_commitments",
      { query: "Payment Plan" },
      ownerId,
    )) as { commitments: unknown[] };
    expect(found.commitments).toEqual([]);
  });

  it("stamps, sets, and corrects the cancellation date", async () => {
    const stamped = await save(ownerId, { id: plan.id, status: "cancelled" });
    expect(stamped.cancelledOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const dated = await save(ownerId, {
      id: plan.id,
      status: "cancelled",
      cancelledOn: "2026-09-01",
    });
    expect(dated.cancelledOn).toBe("2026-09-01");

    const corrected = await save(ownerId, { id: plan.id, cancelledOn: "2026-08-15" });
    expect(corrected).toMatchObject({ status: "cancelled", cancelledOn: "2026-08-15" });

    const reactivated = await save(ownerId, { id: plan.id, status: "active" });
    expect(reactivated.cancelledOn).toBeNull();
  });

  it("refuses a cancellation date on a bill that is not cancelled", async () => {
    await expect(
      save(ownerId, { id: plan.id, cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save(ownerId, { id: plan.id, status: "active", cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      save(ownerId, { name: "Brand New", cancelledOn: "2026-09-01" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("needs an id or a name", async () => {
    await expect(save(ownerId, { status: "paused" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("gives a new bill the monthly default when no cadence is named", async () => {
    const created = await save(ownerId, { name: "Streaming", expectedCents: 999 });
    expect(created.cadence).toBe("Monthly");
  });

  it("will not let another user read, rename, or cancel the bill by id", async () => {
    await expect(
      save(intruderId, { id: plan.id, status: "cancelled" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      save(intruderId, { id: plan.id, name: "Mine now" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });

    const untouched = await save(ownerId, { id: plan.id });
    expect(untouched).toMatchObject({ name: "Payment Plan", status: "active" });
  });
});
