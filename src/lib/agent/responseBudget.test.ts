import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "@/lib/finances/analytics";
import { analyzeInsights } from "@/lib/finances/insightsAnalysis";
import type { StoredBill } from "@/lib/finances/recurringBills";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { outputSchemas } from "./contracts";
import { recurringBillsResponse } from "./financeTools";

/**
 * Default responses stay under the connector gateway's cap.
 *
 * The gateway keeps the first 20,000 bytes of a tool's text and silently drops the rest. In
 * Oct 2026 four tools crossed it on Lee's real data — `list_recurring_bills` at 31.5 KB, so
 * its due dates never arrived at all — and nothing failed: the agent just saw less. 16 KB
 * leaves headroom for the data to grow before the cap bites again.
 *
 * The fixtures are sized to that real data, and each case also proves its fixture is big
 * enough to have broken the old shape — a budget test over a toy fixture passes forever.
 */
const BUDGET_BYTES = 16 * 1024;
const GATEWAY_CAP_BYTES = 20_000;

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const TODAY = "2026-10-01";

/** The 35 bills Lee had declared on 2026-10-01, by name — real names are long. */
const BILL_NAMES = [
  "Amazon Prime Membership",
  "CVS ExtraCare",
  "Car Insurance (Geico)",
  "Carrot Weather",
  "ChatGPT",
  "Chewy",
  "Claude",
  "Copilot (GitHub)",
  "Curiosity Stream",
  "Dante's Meds (VetSource)",
  "Domain Name (Go Daddy)",
  "Dropbox",
  "Electricity (SMECO)",
  "GRAY MIRROR",
  "Grok",
  "Home Security (SimpliSafe)",
  "Huel",
  "Internet (Comcast)",
  "Lotus Eaters",
  "Neon Database",
  "Paste",
  "Pet Insurance (MetLife)",
  "Phone (Mint Mobile)",
  "Propane (Taylor Gas)",
  "Rent",
  "Rent Reporting",
  "Renter's Insurance (Sure)",
  "Robokiller",
  "SimpleFIN",
  "Sky Tonight",
  "Spotify",
  "Trash (Evergreen Disposal)",
  "Water & Sewer (St Mary's County)",
  "YouTube",
  "iCloud+",
];

function charge(payeeId: string, dateKey: string, cents: number): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    accountId: crypto.randomUUID(),
    accountName: "Capital One •••3448",
    accountKind: "credit_card",
    transactionDate: dateKey,
    description: payeeId,
    amountCents: -cents,
    sourceCategory: "",
    derivedCategory: payeeId,
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    payeeId,
    payeeName: payeeId,
  };
}

/** Three years of monthly charges per bill, and 30 weekly merchants detection will find. */
function recurringFixture(): { rows: AnalyticsRow[]; bills: StoredBill[] } {
  const rows: AnalyticsRow[] = [];
  const bills: StoredBill[] = BILL_NAMES.map((name, index) => {
    const payeeId = `payee:${name}`;
    for (let month = 0; month < 36; month++) {
      rows.push(
        charge(
          payeeId,
          shiftDateKey("2023-10-05", month * 30 + (index % 20)),
          1000 + index * 137,
        ),
      );
    }
    return {
      id: crypto.randomUUID(),
      name,
      payeeIds: [payeeId],
      status: index % 7 === 6 ? "cancelled" : "active",
      cadenceMonths: index % 5 === 0 ? 3 : 1,
      expectedCents: 1000 + index * 137,
      anchorDate: null,
      scheduled: name !== "Propane (Taylor Gas)",
      dueDay: null,
      leadDays: 0,
    };
  });
  for (let merchant = 0; merchant < 30; merchant++) {
    const payeeId = `DETECTED MERCHANT NUMBER ${merchant} STORE #1981`;
    for (let week = 0; week < 14; week++) {
      rows.push(charge(payeeId, shiftDateKey("2026-07-02", week * 7), 2500 + merchant));
    }
  }
  return { rows, bills };
}

describe("default response size", () => {
  it("list_recurring_bills", () => {
    const { rows, bills } = recurringFixture();
    const analysis = analyzeInsights(rows, bills, { window: "3m", today: TODAY });
    const response = recurringBillsResponse(analysis, {
      includeUpcoming: true,
      status: "active",
    });

    expect(outputSchemas.list_recurring_bills.safeParse(response).success).toBe(true);
    expect(bytes(response)).toBeLessThan(BUDGET_BYTES);
    // Realistic: the whole table, unpaged, is what used to cross the cap.
    const unpaged = recurringBillsResponse(analysis, {
      includeUpcoming: true,
      status: "any",
      limit: 200,
    });
    expect(bytes(unpaged)).toBeGreaterThan(GATEWAY_CAP_BYTES);
    // And whatever the page size, the due dates come before the table.
    expect(JSON.stringify(unpaged).indexOf('"upcoming"')).toBeLessThan(
      JSON.stringify(unpaged).indexOf('"bills"'),
    );
  });
});
