import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { importFinanceCsvFiles, type ImportFile } from "./import";
import { deletePaymentResolution, updatePaymentResolution } from "./mutations";
import { getPaymentResolution, listPaymentResolutions } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("paypal resolutions");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `paypal-res-${crypto.randomUUID()}@localhost`,
      name: "PayPal Resolution Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

/** Real extracted furniture from the April 2025 statement, including the wrap. */
const APRIL: ImportFile = {
  name: "statement-Apr-2025.pdf",
  text: `Statement Period PayPal Account ID
Apr 1, 2025 - Apr 30,
2025
leeraulin@gmail.com
PAYPAL ACCOUNT
ACCOUNT ACTIVITY
DATE DESCRIPTION CURRENCY AMOUNT FEES TOTAL*
04/20/202
5 General Payment: Dennis Raulin
ID: 0LT3288171837814B
USD 2,000.00 0.00 2,000.00
04/20/202
5 User Initiated Withdrawal
CAPITAL ONE N.A. - Checking x-2322
PayPal Balance -2,000.00 USD
ID: 67G495071Y8716611
USD -2,000.00 0.00 -2,000.00
04/14/2025 PreApproved Payment Bill User Payment:
Pluralsight, LLC
CAPITAL ONE N.A. - Checking x-2322
237.44 USD
ID: 9L101567DS004820M
USD -237.44 0.00 -237.44
PAYPAL BALANCE ACCOUNT
ACCOUNT ACTIVITY
04/20/202
5 General Payment: Dennis Raulin
ID: 0LT3288171837814B
USD 2,000.00 0.00 2,000.00
`,
};

describeDb("PayPal resolution import", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("stores named events and not a register row or a PayPal account", async () => {
    const result = await importFinanceCsvFiles({ userId, files: [APRIL] });

    expect(result).toMatchObject({
      created: 0,
      accountsCreated: 0,
      resolutionsCreated: 2,
      resolutionsSkipped: 0,
    });

    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(rows).toEqual([]);

    const stored = await listPaymentResolutions(userId);
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "paypal",
          externalId: "0LT3288171837814B",
          counterparty: "Dennis Raulin",
          amountCents: 200000,
          direction: "in",
        }),
        expect.objectContaining({
          externalId: "9L101567DS004820M",
          counterparty: "Pluralsight, LLC",
          amountCents: -23744,
          direction: "out",
        }),
      ]),
    );
    // The withdrawal is a funding leg, not a name for a register row.
    expect(stored.map((row) => row.externalId)).not.toContain("67G495071Y8716611");
  });

  it("inserts nothing on a second import of the same statement", async () => {
    await importFinanceCsvFiles({ userId, files: [APRIL] });
    const again = await importFinanceCsvFiles({ userId, files: [APRIL] });
    expect(again).toMatchObject({
      resolutionsCreated: 0,
      resolutionsSkipped: 2,
    });
    expect(await listPaymentResolutions(userId)).toHaveLength(2);
  });
});

describeDb("PayPal resolution isolation", () => {
  it("does not let a second user read, change, or delete the first user's row", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    await importFinanceCsvFiles({ userId: owner, files: [APRIL] });
    const [gift] = (await listPaymentResolutions(owner)).filter(
      (row) => row.externalId === "0LT3288171837814B",
    );
    expect(gift).toBeDefined();

    expect(await listPaymentResolutions(other)).toEqual([]);
    expect(await getPaymentResolution(other, gift.id)).toBeNull();
    expect(await getPaymentResolution(owner, gift.id)).not.toBeNull();

    await expect(
      updatePaymentResolution(other, gift.id, { counterparty: "Stolen" }),
    ).rejects.toThrow(/not found/i);
    expect(await getPaymentResolution(owner, gift.id)).toMatchObject({
      counterparty: "Dennis Raulin",
    });

    await expect(deletePaymentResolution(other, gift.id)).rejects.toThrow(/not found/i);
    expect(await getPaymentResolution(owner, gift.id)).not.toBeNull();

    await deletePaymentResolution(owner, gift.id);
    expect(await getPaymentResolution(owner, gift.id)).toBeNull();
  });
});
