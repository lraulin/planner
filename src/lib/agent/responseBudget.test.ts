import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "@/lib/finances/analytics";
import { analyzeInsights } from "@/lib/finances/insightsAnalysis";
import type { StoredBill } from "@/lib/finances/recurringBills";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { outputSchemas } from "./contracts";
import {
  composeScenario,
  type ScenarioLineInput,
} from "@/lib/finances/scenarios/compose";
import { scenarioDetailResponse } from "./scenarioTools";
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

  it("get_scenario", () => {
    // Every bill Lee has declared, a few dozen lines with sub-lines, and a long Uncovered
    // list: the largest scenario he is likely to build, not a toy one.
    const lines: ScenarioLineInput[] = [];
    for (let index = 0; index < 30; index++) {
      lines.push({
        id: crypto.randomUUID(),
        parentId: index % 4 === 3 ? lines[index - 1].id : null,
        kind: "expense",
        sortKey: `a${String(index).padStart(3, "0")}1`,
        name: `A line with a fairly long descriptive name number ${index}`,
        source: {
          type: "manual",
          amountCents: 1000 + index * 311,
          cadence: { unit: "month", n: 1 },
        },
        envelopeId: crypto.randomUUID(),
        budgetGroupId: null,
      });
    }
    const composition = composeScenario({
      bills: BILL_NAMES.map((name, index) => ({
        envelopeId: crypto.randomUUID(),
        name,
        groupLabel: index % 3 === 0 ? "Housing › Utilities" : "Subscriptions",
        status: index % 7 === 6 ? ("cancelled" as const) : ("active" as const),
        monthlyCents: 1000 + index * 137,
      })),
      income: [
        {
          envelopeId: crypto.randomUUID(),
          name: "Paycheck",
          expectedMonthlyCents: 480286,
        },
      ],
      overrides: [],
      lines,
      supply: { itemMonthlyCents: new Map(), groupMonthlyCents: new Map() },
      actuals: {
        byEnvelope: new Map(lines.map((line) => [line.envelopeId ?? "", 12345])),
        byGroup: new Map(),
      },
      billActuals: new Map(),
    });
    const response = scenarioDetailResponse({
      scenario: {
        id: crypto.randomUUID(),
        name: "After closing",
        notes: "",
        sortKey: "a",
      },
      composition,
      uncovered: Array.from({ length: 15 }, (_, index) => ({
        envelopeId: crypto.randomUUID(),
        name: `Uncovered envelope with a long name ${index}`,
        monthlyCents: 5000 + index,
      })),
      actualMonths: 12,
      lineCount: lines.length,
    });

    expect(outputSchemas.get_scenario.safeParse(response).success).toBe(true);
    expect(bytes(response)).toBeLessThan(BUDGET_BYTES);
  });
});
