import { describe, expect, it } from "vitest";

import { parseCsvRows } from "@/lib/csv/text";
import type { ExportColumnSource } from "@/lib/grid/exportCsv";
import type { ForwardBucket } from "@/lib/finances/commitments";
import type { SpendingVsIncome } from "@/lib/finances/commitmentRows";
import {
  budgetExportDocument,
  gridExportSection,
  serializeBudgetExport,
  totalsCaption,
  type BudgetExportInput,
} from "./export";
import type { BudgetMonth } from "./envelope";
import type { BudgetRow } from "./rows";

/** Just the fields the export reads. The fold builds the rest and this module ignores it. */
function month(overrides: Partial<BudgetMonth> = {}): BudgetMonth {
  return {
    month: "2026-09",
    categories: {},
    fromLastMonthCents: 100_00,
    totalIncomeCents: 0,
    availableFundsCents: 0,
    lastMonthOverspentCents: 0,
    totalAssignedCents: 0,
    totalActivityCents: 0,
    totalBalanceCents: 0,
    bufferedCents: 0,
    assignedInFutureMonthsCents: 0,
    readyToAssignCents: 0,
    uncategorizedActivityCents: 0,
    accountReconciliationCents: 0,
    terms: [
      { label: "Funds from last month", cents: 100_00 },
      { label: "Assigned this month", cents: -100_00 },
    ],
    ...overrides,
  };
}

function envelope(name: string, activityCents: number): BudgetRow {
  return {
    id: name,
    groupId: null,
    sortKey: name,
    name,
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
    isIncome: true,
    hidden: false,
    notes: "",
    snoozed: false,
    assignedCents: 0,
    activityCents,
    balanceCents: 0,
    carryover: false,
    target: null,
    goalCents: null,
    kind: "income",
    bill: null,
    nextDueKey: null,
    expectedKey: null,
    dueKey: null,
  };
}

const comparison: SpendingVsIncome = {
  bills: { annualCents: 1200_00, monthlyCents: 100_00, weeklyCents: 23_00 },
  income: { medianPaycheckCents: 200_00, monthlyCents: 400_00, annualCents: 4800_00 },
  remainder: { monthlyCents: 300_00, annualCents: 3600_00 },
};

const months: ForwardBucket[] = [
  {
    key: "2026-09",
    label: "2026-09",
    startKey: "2026-09-01",
    endKey: "2026-09-30",
    items: [
      { name: "Rent", cents: 900_00, dated: true, dateKey: "2026-09-01" },
      { name: "Streaming", cents: 12_00, dated: false, dateKey: null },
    ],
    totalCents: 912_00,
    aboveMedian: true,
  },
  {
    key: "2026-10",
    label: "2026-10",
    startKey: "2026-10-01",
    endKey: "2026-10-31",
    items: [],
    totalCents: 0,
    aboveMedian: false,
  },
];

/** A grid row is a node row with a depth; that is all the exporter needs of one. */
type Row = { depth: number; node: { name: string; assignedCents: number } };

const gridColumns: (ExportColumnSource<Row> & { align?: string })[] = [
  { id: "name", label: "Envelope", compactText: (row) => row.node.name },
  {
    id: "assigned",
    label: "Assigned",
    align: "right",
    compactText: (row) => `$${(row.node.assignedCents / 100).toFixed(2)}`,
  },
  // No accessor at all — the grid cannot turn this into text, so it never exports.
  { id: "chrome", label: "Funding bar" },
];

const gridRows: Row[] = [
  { depth: 0, node: { name: "Groceries", assignedCents: 400_00 } },
  { depth: 0, node: { name: "Gas", assignedCents: 60_00 } },
];

function input(overrides: Partial<BudgetExportInput> = {}): BudgetExportInput {
  return {
    month: month(),
    income: [envelope("Paycheck", 2000_00)],
    receivedCents: 2000_00,
    expectedIncomeCents: 2100_00,
    spendingTotals: {
      assignedCents: 460_00,
      activityCents: -120_00,
      balanceCents: 340_00,
    },
    tables: [
      gridExportSection(
        "Regular spending",
        totalsCaption({
          assignedCents: 460_00,
          activityCents: -120_00,
          balanceCents: 340_00,
        }),
        gridColumns,
        gridRows,
      ),
    ],
    forecast: { months, comparison },
    formatDate: (dateKey) => `on ${dateKey}`,
    ...overrides,
  };
}

describe("gridExportSection", () => {
  it("keeps the grid's visible columns and drops the ones it cannot write", () => {
    const section = gridExportSection("Bills", "caption", gridColumns, gridRows);
    expect(section.columns).toEqual([
      { label: "Envelope" },
      { label: "Assigned", align: "right" },
    ]);
    expect(section.rows[0]).toEqual({ depth: 0, cells: ["Groceries", "$400.00"] });
  });

  it("loses a column the grid is hiding, and only from that table", () => {
    // Column visibility is the grid's own state; the document reads what was passed in.
    const hidden = gridExportSection(
      "Bills",
      "caption",
      gridColumns.filter((column) => column.id !== "assigned"),
      gridRows,
    );
    expect(hidden.columns).toEqual([{ label: "Envelope" }]);
    expect(hidden.rows[0]?.cells).toEqual(["Groceries"]);
  });
});

describe("budgetExportDocument", () => {
  it("is the whole page, in reading order", () => {
    const doc = budgetExportDocument(input());
    expect(doc.title).toBe("Budget — September 2026");
    expect(doc.headline).toEqual({
      label: "Ready to Assign",
      value: "$0.00",
      note: "every dollar has a job",
    });
    expect(doc.sections.map((section) => section.title)).toEqual([
      "Summary",
      "Income",
      "Regular spending",
      "Expected vs income",
      "Next 12 months",
    ]);
  });

  it("carries Ready to Assign's own terms rather than rebuilding them", () => {
    const summary = budgetExportDocument(input()).sections[0];
    expect(summary?.rows.map((row) => row.cells)).toEqual([
      ["Funds from last month", "$100.00"],
      ["Assigned this month", "-$100.00"],
      ["Ready to Assign", "$0.00"],
      ["Spending assigned", "$460.00"],
      ["Spending spent", "-$120.00"],
      ["Spending left", "$340.00"],
    ]);
  });

  it("captions Summary with the account pool only when there is a live one", () => {
    expect(budgetExportDocument(input()).sections[0]?.caption).toBeUndefined();
    expect(
      budgetExportDocument(input({ accountPoolCents: 800_00 })).sections[0]?.caption,
    ).toBe("Account pool $800.00 = Ready to Assign + envelope balances");
    expect(
      budgetExportDocument(
        input({
          accountPoolCents: 800_00,
          month: month({ assignedInFutureMonthsCents: 50_00, bufferedCents: 25_00 }),
        }),
      ).sections[0]?.caption,
    ).toBe(
      "Account pool $800.00 = Ready to Assign + envelope balances + assigned in future months + held",
    );
  });

  it("exports income as activity alone, with received and expected as the caption", () => {
    const income = budgetExportDocument(input()).sections[1];
    expect(income?.columns.map((column) => column.label)).toEqual([
      "Envelope",
      "Activity",
    ]);
    expect(income?.caption).toBe(
      "Received $2,000.00 · Expected regular income $2,100.00/mo",
    );
    expect(income?.rows.map((row) => row.cells)).toEqual([["Paycheck", "$2,000.00"]]);
  });

  it("names the remainder for its sign", () => {
    const line = (remainderCents: number) =>
      budgetExportDocument(
        input({
          forecast: {
            months,
            comparison: {
              ...comparison,
              remainder: {
                monthlyCents: remainderCents,
                annualCents: remainderCents * 12,
              },
            },
          },
        }),
      ).sections[3]?.rows[2]?.cells[0];
    expect(line(300_00)).toBe("Left after bills");
    expect(line(-1)).toBe("Overcommitted");
  });

  it("puts a month's bills one level under the month, dated through the caller's formatter", () => {
    const forward = budgetExportDocument(input()).sections[4];
    expect(forward?.rows).toEqual([
      { depth: 0, cells: ["on 2026-09-01", "", "$912.00", "", "yes"] },
      { depth: 1, cells: ["", "Rent", "$900.00", "on 2026-09-01", ""] },
      { depth: 1, cells: ["", "Streaming", "$12.00", "", ""] },
      { depth: 0, cells: ["on 2026-10-01", "", "$0.00", "", ""] },
    ]);
  });
});

/** 13:41:36 Eastern daylight. Same pin the grid stamp tests use. */
const PINNED = new Date("2026-08-29T17:41:36.000Z");

describe("serializeBudgetExport", () => {
  it("stacks CSV sections under a title, an export stamp, and a headline row", () => {
    const csv = serializeBudgetExport("csv", budgetExportDocument(input()), PINNED);
    const rows = parseCsvRows(csv);
    expect(rows[0]).toEqual(["Budget — September 2026"]);
    expect(rows[1]).toEqual(["Exported 2026-08-29T13:41:36-04:00"]);
    expect(rows[2]).toEqual(["Ready to Assign", "$0.00", "every dollar has a job"]);
    expect(rows[3]).toEqual(["Summary"]);
    expect(rows[4]).toEqual(["Term", "Amount"]);
    // A blank line between sections is what makes Excel read this as stacked blocks.
    expect(csv).toContain("\n\nIncome\n");
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("quotes a section caption that contains a comma", () => {
    // The forecast captions are prose. Unquoted, one would split into columns and shift
    // every row of that section left.
    const csv = serializeBudgetExport("csv", budgetExportDocument(input()), PINNED);
    const rows = parseCsvRows(csv);
    const caption = rows.find((row) => row[0]?.startsWith("What active bills cost"));
    expect(caption).toHaveLength(1);
  });

  it("flattens the forecast tree in CSV — every row keeps all five columns", () => {
    const csv = serializeBudgetExport("csv", budgetExportDocument(input()), PINNED);
    expect(csv).toContain(
      "on 2026-09-01,,$912.00,,yes\n,Rent,$900.00,on 2026-09-01,\n,Streaming,$12.00,,\n",
    );
  });

  it("writes Markdown as headings, a bold headline, and pipe tables", () => {
    const md = serializeBudgetExport("markdown", budgetExportDocument(input()), PINNED);
    expect(md).toContain("# Budget — September 2026\n");
    expect(md).toContain("Exported 2026-08-29T13:41:36-04:00");
    expect(md).toContain("**Ready to Assign $0.00** — every dollar has a job");
    expect(md).toContain("## Regular spending\n");
    // Money columns are right-aligned; the label column is not.
    expect(md).toContain("| Envelope | Assigned |\n| --- | ---: |");
    // Depth shows as an indent, since a Markdown table cannot nest.
    expect(md).toContain(`| ${" ".repeat(4)} | Rent |`);
  });

  it("is one keyed object in JSON, not the array a single grid exports", () => {
    const doc = budgetExportDocument(input());
    const parsed = JSON.parse(serializeBudgetExport("json", doc, PINNED));
    expect(Array.isArray(parsed)).toBe(false);
    expect(Object.keys(parsed)).toEqual([
      "exportedAt",
      "title",
      "headline",
      "sections",
    ]);
    expect(parsed.exportedAt).toBe("2026-08-29T13:41:36-04:00");
    expect(parsed.sections[2]).toEqual({
      title: "Regular spending",
      caption: "Assigned $460.00 · Spent -$120.00 · Left $340.00",
      rows: [
        { Envelope: "Groceries", Assigned: "$400.00" },
        { Envelope: "Gas", Assigned: "$60.00" },
      ],
    });
  });

  it("nests a month's bills under it in JSON", () => {
    const parsed = JSON.parse(
      serializeBudgetExport("json", budgetExportDocument(input()), PINNED),
    );
    const forward = parsed.sections[4];
    expect(forward.rows).toHaveLength(2);
    expect(forward.rows[0].children).toEqual([
      {
        Month: "",
        Item: "Rent",
        Amount: "$900.00",
        Date: "on 2026-09-01",
        "Above median": "",
      },
      { Month: "", Item: "Streaming", Amount: "$12.00", Date: "", "Above median": "" },
    ]);
    expect(forward.rows[1].children).toBeUndefined();
  });

  it("writes the same document as YAML, with the same nesting", () => {
    const yaml = serializeBudgetExport("yaml", budgetExportDocument(input()), PINNED);
    expect(
      yaml.startsWith(
        'exportedAt: "2026-08-29T13:41:36-04:00"\ntitle: Budget — September 2026\nheadline:\n',
      ),
    ).toBe(true);
    expect(yaml).toContain("  label: Ready to Assign\n");
    expect(yaml).toContain("sections:\n  - title: Summary\n");
    // The forecast items sit under their month's `children`, as they do in JSON.
    expect(yaml).toContain(
      '        children:\n          - Month: ""\n            Item: Rent\n',
    );
  });
});
