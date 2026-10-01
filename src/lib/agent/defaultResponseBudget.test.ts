import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "@/lib/finances/analytics";
import type { FinanceAccountRow } from "@/lib/finances/types";
import { insightsFilterOptions } from "@/lib/finances/insightsFilter";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { row } from "@/lib/tree/fixtures";
import type { OutlineNode } from "@/lib/tree/types";
import { inputSchemas, outputSchemas } from "./contracts";
import { financeOverviewResponse } from "./financeTools";
import { CONTEXT_OPEN_WORK_DEFAULT_LIMIT, contextWork } from "./outlineTools";
import { weeklyPlanResponse } from "./planTools";
import { buildPathMap, nodeSummary } from "./serialize";

/**
 * get_finance_overview, get_context and load_weekly_plan stay under the connector gateway's
 * cap with their default arguments.
 *
 * The gateway keeps the first 20,000 bytes of a tool's text and drops the rest without an
 * error. On 2026-10-01, Lee's real data put get_finance_overview at 30.5 KB and
 * load_weekly_plan at 23.3 KB, so both arrived cut off. 16 KB leaves room for the data to
 * grow. (`responseBudget.test.ts` guards list_recurring_bills the same way.)
 *
 * Fixtures are sized to that data, and each case proves its fixture would have broken the
 * old shape. A budget test over a toy fixture would pass forever.
 */
const BUDGET_BYTES = 16 * 1024;
const GATEWAY_CAP_BYTES = 20_000;

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const uuid = () => crypto.randomUUID();

// — get_finance_overview ——————————————————————————————————————————————————————

/** Lee's 50 envelopes on 2026-10-01. Real names are long, and the overview lists all of them. */
const ENVELOPE_NAMES = [
  "Amazon Prime Membership",
  "Baby Stuff",
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
  "Eating Out",
  "Electricity (SMECO)",
  "GRAY MIRROR",
  "Gas",
  "General Spending",
  "Gifts",
  "Groceries",
  "Grok",
  "Handgun",
  "Home Security (SimpliSafe)",
  "House",
  "Huel",
  "Interest",
  "Internet (Comcast)",
  "Lotus Eaters",
  "Neon Database",
  "Paste",
  "Payroll",
  "Pet Insurance (MetLife)",
  "Phone (Mint Mobile)",
  "Pizza",
  "Propane (Taylor Gas)",
  "Rent",
  "Rent Reporting",
  "Renter's Insurance (Sure)",
  "Robokiller",
  "Sami Nails",
  "SimpleFIN",
  "Sky Tonight",
  "Spotify",
  "Trash (Evergreen Disposal)",
  "VA",
  "Visit Inlaws",
  "Water & Sewer (St Mary's County)",
  "Wedding",
  "YouTube",
  "iCloud+",
];

function account(
  name: string,
  overrides: Partial<FinanceAccountRow> = {},
): FinanceAccountRow {
  return {
    id: uuid(),
    name,
    kind: "credit_card",
    institution: "Capital One",
    url: "",
    externalSource: "",
    externalKey: "",
    closedAt: null,
    offBudget: false,
    balanceCents: -47384,
    ledgerBalanceCents: -277468,
    statementClosingCents: -24095,
    statementPeriodEnd: "2026-08-21",
    balanceMismatchCents: -230084,
    syncedBalanceAsOf: null,
    historySource: "feed",
    balanceSource: null,
    transactionCount: 5212,
    ...overrides,
  };
}

/**
 * Seven years of rows naming about 700 distinct merchants, as Lee's history does: raw bank
 * descriptions ("COINBASE BUY 0.00049432 BTC", "92549 - BWI HOURLY GARAGEBALTIMOREMD") rarely
 * repeat, which is why the merchant list was most of the old response.
 */
function overviewRows(): AnalyticsRow[] {
  const rows: AnalyticsRow[] = [];
  for (let index = 0; index < 7400; index++) {
    const merchant =
      index % 10 < 1
        ? `COINBASE BUY 0.000${(49432 + index).toString()} BTC`
        : `MERCHANT ${index % 640} - STORE #${1000 + (index % 640)}LEXINGTON PARMD`;
    rows.push({
      id: uuid(),
      accountId: `account-${index % 6}`,
      accountName: `Account ${index % 6}`,
      accountKind: "credit_card",
      transactionDate: shiftDateKey("2020-02-01", Math.floor(index / 3)),
      description: merchant,
      amountCents: -1000 - (index % 5000),
      sourceCategory: "",
      derivedCategory: ENVELOPE_NAMES[index % ENVELOPE_NAMES.length],
      derivedFlow: "spend",
      flowOverride: null,
      transferGroupId: null,
      payeeId: null,
      payeeName: merchant,
    });
  }
  return rows;
}

function overviewFixture() {
  const groups = [
    "AI",
    "Apple Subscriptions",
    "Discretionary",
    "Housing",
    "Insurance",
    "Pets",
    "Regular",
    "Subscriptions",
    "Utilities",
  ].map((name) => ({
    id: uuid(),
    name,
    parentGroupId: null,
    kind: "bill" as const,
  }));
  const categories = ENVELOPE_NAMES.map((name, index) => ({
    id: uuid(),
    name,
    groupId: groups[index % groups.length].id,
    kind: "bill" as const,
    incomeRole: "other" as const,
    expectedMonthlyIncomeCents: null,
  }));
  const live = account("Capital One •••3448", {
    balanceCents: -10148,
    syncedBalanceAsOf: new Date("2026-10-01T12:00:00Z"),
    balanceSource: "browser",
  });
  const accounts = [
    account("360 Checking •••2322", { kind: "checking" }),
    account("360 Performance Savings •••2603", { kind: "savings" }),
    account("CD •••2957", { kind: "investment", closedAt: new Date("2024-07-25") }),
    live,
    account("Chase •••9910", { institution: "Chase" }),
    account("Coinbase", {
      kind: "investment",
      institution: "Coinbase",
      statementClosingCents: null,
      statementPeriodEnd: null,
    }),
  ];
  return {
    accounts,
    pending: [{ accountId: live.id, amountCents: -32249 }],
    rows: overviewRows(),
    unclassifiedCount: 0,
    carrying: { interestCents: 124500, feesCents: 2900 },
    statements: [],
    budget: { categories, groups },
  };
}

describe("get_finance_overview response budget", () => {
  const input = overviewFixture();
  const response = financeOverviewResponse(input);

  it("stays under 16 KB and matches its output schema", () => {
    expect(bytes(response)).toBeLessThan(BUDGET_BYTES);
    expect(outputSchemas.get_finance_overview.safeParse(response).success).toBe(true);
  });

  it("uses a fixture whose merchant list alone would have broken the cap", () => {
    const merchants = insightsFilterOptions(input.rows).merchants;
    expect(response.merchantCount).toBe(merchants.length);
    expect(bytes({ ...response, merchants })).toBeGreaterThan(GATEWAY_CAP_BYTES);
  });

  it("reports the live account as posted plus pending", () => {
    const live = response.accounts.find((row) => row.balanceSource === "live");
    expect(live).toMatchObject({
      postedCents: -10148,
      pendingCents: -32249,
      balanceCents: -42397,
      balanceAsOf: "2026-10-01T12:00:00.000Z",
    });
  });
});

// — get_context / load_weekly_plan ———————————————————————————————————————————

function node(
  partial: Partial<OutlineNode> & Pick<OutlineNode, "id" | "type" | "name">,
): OutlineNode {
  return {
    ...row(partial),
    lapLetter: null,
    lapRank: null,
    resultAreaName: null,
    projectPriorityLetter: null,
    projectPriorityRank: null,
    effectiveCategory: null,
    effortRollupMinutes: null,
    effortLeftRollupMinutes: null,
    actualEffortRollupMinutes: 0,
    percentCompleteRollup: 0,
    childCount: 0,
    hasChildren: false,
    hasActiveChildren: false,
    hidden: false,
    shelf: null,
    ...partial,
  };
}

const AREAS = [
  "Financial",
  "Health/Fitness",
  "Family",
  "Pets",
  "Home & Property",
  "Work & Career",
  "Politics",
  "Personal Development",
  "Grooming",
  "Leisure & Hobbies",
];

/**
 * Lee's outline shape on 2026-10-01: 10 areas, goals under them, about 40 open projects
 * nested up to four deep with long names, and about 100 A/B open tasks under those.
 */
function outlineFixture(): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  const areas = AREAS.map((name, index) =>
    node({
      id: uuid(),
      type: "result_area",
      name,
      priorityLetter: "A",
      priorityRank: index + 1,
    }),
  );
  nodes.push(...areas);
  const goals = areas.map((area, index) =>
    node({
      id: uuid(),
      type: "goal",
      name: `Goal for ${area.name}: a long-term outcome worth planning toward`,
      parentId: area.id,
      depth: 1,
      state: "in_progress",
      priorityLetter: index % 2 === 0 ? "A" : null,
    }),
  );
  nodes.push(...goals);
  const projects: OutlineNode[] = [];
  for (let index = 0; index < 42; index++) {
    const parent = index < 10 ? goals[index] : projects[index % projects.length];
    projects.push(
      node({
        id: uuid(),
        type: "project",
        name: `Project ${index}: Get AWS Certified Developer - Associate Certification track`,
        parentId: parent.id,
        depth: parent.depth + 1,
        state: index % 3 === 0 ? "postponed" : "in_progress",
        priorityLetter: index % 4 === 0 ? null : index % 2 === 0 ? "A" : "B",
        priorityRank: index % 5,
        focus: index % 7 === 0,
        deadline: index % 6 === 0 ? new Date("2026-10-26T12:00:00Z") : null,
      }),
    );
  }
  nodes.push(...projects);
  for (let index = 0; index < 100; index++) {
    const parent = projects[index % projects.length];
    nodes.push(
      node({
        id: uuid(),
        type: "task",
        name: `Task ${index}: Start Drive On Time 3-Hour Roadway Safety online course`,
        parentId: parent.id,
        depth: parent.depth + 1,
        state: "not_started",
        priorityLetter: index % 2 === 0 ? "A" : "B",
        priorityRank: 1,
        effortMinutes: 30,
        effortLeftMinutes: 30,
      }),
    );
  }
  return nodes;
}

describe("get_context response budget", () => {
  const outline = outlineFixture();

  it("defaults to 10 open-work rows and stays under 16 KB", () => {
    const parsed = inputSchemas.get_context.parse({});
    expect(parsed.topOpenWorkLimit).toBe(CONTEXT_OPEN_WORK_DEFAULT_LIMIT);
    const work = contextWork(outline, parsed.topOpenWorkLimit);
    expect(work.topOpenWork).toHaveLength(10);
    expect(work.topOpenWorkInfo.hasMore).toBe(true);
    const response = {
      asOf: "2026-10-01T14:00:00.000Z",
      weekStart: "2026-09-27",
      ...work,
      weeklyPlan: null,
      weekAppointmentCount: 15,
    };
    expect(bytes(response)).toBeLessThan(BUDGET_BYTES);
    expect(outputSchemas.get_context.safeParse(response).success).toBe(true);
  });

  it("uses a fixture big enough that the full list would break the cap", () => {
    expect(bytes(contextWork(outline, 100))).toBeGreaterThan(GATEWAY_CAP_BYTES);
  });
});

/**
 * load_weekly_plan's shape on Lee's data, 2026-10-01: 10 areas, 2 A-or-unprioritized goals
 * (plus lower-priority ones it filters out), 41 open projects averaging 26-character names
 * nested up to four deep, 4 plan entries with long rewrites, and 15 appointments.
 */
function weeklyPlanFixture() {
  const nodes: OutlineNode[] = [];
  const areas = AREAS.map((name, index) =>
    node({
      id: uuid(),
      type: "result_area",
      name,
      priorityLetter: index < 6 ? "A" : "B",
      priorityRank: index + 1,
    }),
  );
  nodes.push(...areas);
  const goals = areas.slice(0, 4).map((area, index) =>
    node({
      id: uuid(),
      type: "goal",
      name: `Goal ${index}: buy a house soon`,
      parentId: area.id,
      depth: 1,
      state: "in_progress",
      priorityLetter: index < 2 ? "A" : "C",
    }),
  );
  nodes.push(...goals);
  const projects: OutlineNode[] = [];
  const states = ["in_progress", "not_started", "postponed", "proposed"] as const;
  for (let index = 0; index < 41; index++) {
    const parent =
      index < 10
        ? areas[index]
        : index < 14
          ? goals[index - 10]
          : projects[(index * 7) % projects.length];
    projects.push(
      node({
        id: uuid(),
        type: "project",
        // 26 characters on average, like the real list.
        name: `Project ${String(index).padStart(2, "0")} plan ${"x".repeat(index % 25)}`,
        parentId: parent.id,
        depth: parent.depth + 1,
        state: states[index % states.length],
        priorityLetter: index % 3 === 0 ? null : index % 2 === 0 ? "A" : "B",
        priorityRank: index % 3 === 0 ? null : (index % 5) + 1,
        focus: index % 8 === 0,
        deadline: index % 5 === 0 ? new Date("2026-10-26T12:00:00Z") : null,
      }),
    );
  }
  nodes.push(...projects);
  for (let index = 0; index < 120; index++) {
    const parent = projects[index % projects.length];
    nodes.push(
      node({
        id: uuid(),
        type: "task",
        name: `Task ${index}`,
        parentId: parent.id,
        depth: parent.depth + 1,
      }),
    );
  }
  return {
    weekStart: "2026-09-27T00:00:00.000Z",
    weekStartsOn: 0,
    plan: null,
    previousRewrites: [],
    entries: projects.slice(0, 4).map((project) => ({
      id: uuid(),
      nodeId: project.id,
      focus: true,
      reviewed: true,
      rewrite:
        "Long Wolf (settlement Mon Oct 26): send lender ratified contract / lock rate / order VA appraisal; inspections by ~Oct 5; start insurance quotes.",
      committedMinutes: 180,
    })),
    nodes,
    schedule: {
      rangeStart: "2026-09-27",
      occurrences: Array.from({ length: 15 }, (_, index) => {
        const id = uuid();
        const startAt = new Date(Date.UTC(2026, 8, 27 + (index % 7), 13));
        return {
          id,
          occurrenceKey: `${id}@${startAt.toISOString()}`,
          subject: "Grocery Shopping",
          startAt,
          endAt: new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
          projectId: null,
        };
      }),
    },
  };
}

describe("load_weekly_plan response budget", () => {
  const payload = weeklyPlanFixture();
  const response = weeklyPlanResponse(payload);

  it("stays under 16 KB and matches its output schema", () => {
    expect(response.projects).toHaveLength(41);
    expect(bytes(response)).toBeLessThan(BUDGET_BYTES);
    expect(outputSchemas.load_weekly_plan.safeParse(response).success).toBe(true);
  });

  it("uses a fixture whose old full-summary rows would have broken the cap", () => {
    const paths = buildPathMap(payload.nodes);
    const summarize = (type: OutlineNode["type"]) =>
      payload.nodes.filter((n) => n.type === type).map((n) => nodeSummary(n, paths));
    const oldShape = {
      ...response,
      resultAreas: summarize("result_area"),
      goals: summarize("goal"),
      projects: summarize("project"),
    };
    expect(bytes(oldShape)).toBeGreaterThan(GATEWAY_CAP_BYTES);
  });

  it("drops paths from the rows; parentId still links them up", () => {
    expect(response.projects[0]).not.toHaveProperty("path");
    expect(response.projects.every((project) => project.parentId !== null)).toBe(true);
  });
});
