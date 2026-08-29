import { describe, expect, it } from "vitest";
import { unplacedCommands, toolbarWithoutMenu } from "@/lib/commands/fileCommands";
import { buildMenus } from "@/lib/commands/menus";
import { parseCsvRows } from "@/lib/csv/text";
import { gridCopyCommands, gridExportCommands } from "@/lib/grid/exportCsv";
import {
  activityCopyCommands,
  activityEvidenceDocument,
  activityExportCommands,
  activityExportFormatOf,
  ACTIVITY_EVENT_UNAVAILABLE,
  exactBankSnapshots,
  serializeActivityExport,
} from "./export";
import type { FinanceAuditEvent, FinanceMoneyCheckpoint } from "./types";

const PINNED = new Date("2026-08-29T17:41:36.000Z");
const OCCURRED = new Date("2026-08-29T16:00:00.000Z");

function checkpoint(
  overrides: Partial<FinanceMoneyCheckpoint> = {},
): FinanceMoneyCheckpoint {
  return {
    accounts: [
      {
        accountId: "acc-1",
        accountName: "Checking",
        postedCents: 100_00,
        selectedPendingCents: 0,
        workingCents: 100_00,
        ledgerCents: 100_00,
        reconciliationCents: 0,
      },
    ],
    selectedPendingCents: 0,
    accountPoolCents: 80_00,
    budgets: [
      {
        month: "2026-08-01T12:00:00.000Z",
        readyToAssignCents: 50_00,
        accountPoolCents: 80_00,
        accountReconciliationCents: 0,
        uncategorizedCount: 0,
        uncategorizedActivityCents: 0,
        envelopes: [
          {
            envelopeId: "env-1",
            envelopeName: "Groceries",
            assignedCents: 40_00,
            activityCents: -12_00,
            availableCents: 28_00,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function event(overrides: Partial<FinanceAuditEvent> = {}): FinanceAuditEvent {
  const before = checkpoint();
  const after = checkpoint({
    accountPoolCents: 70_00,
    accounts: [
      {
        ...checkpoint().accounts[0],
        workingCents: 90_00,
      },
    ],
    budgets: [
      {
        ...checkpoint().budgets[0],
        readyToAssignCents: 40_00,
        envelopes: [
          {
            envelopeId: "env-1",
            envelopeName: "Groceries",
            assignedCents: 30_00,
            activityCents: -12_00,
            availableCents: 18_00,
          },
        ],
      },
    ],
  });
  return {
    id: "evt-1",
    batchId: "batch-9",
    kind: "bank_snapshot",
    origin: "browser",
    occurredAt: OCCURRED,
    summary: "Imported Chase snapshot",
    scope: {
      accountIds: ["acc-1"],
      accountNames: ["Checking"],
      budgetMonths: ["2026-08-01T12:00:00.000Z"],
    },
    warnings: ["Pending rows older than 36 hours were kept."],
    sourceEvidence: {
      format: "planner-bank-snapshot-v1",
      rawText: "CHASE\nPosted: $90.00",
      capturedAt: "2026-08-29T16:00:00.000Z",
    },
    beforeCheckpoint: before,
    afterCheckpoint: after,
    changes: [
      {
        entityType: "transaction",
        entityIdentity: "tx-1",
        before: { amountCents: 100_00 },
        after: { amountCents: 90_00 },
      },
    ],
    ...overrides,
  };
}

describe("exactBankSnapshots", () => {
  it("pulls planner-bank-snapshot-v1 raw text out of nested evidence", () => {
    expect(
      exactBankSnapshots({
        wrap: {
          format: "planner-bank-snapshot-v1",
          rawText: "CAPITAL ONE\nBalance $12",
        },
      }),
    ).toEqual(["CAPITAL ONE\nBalance $12"]);
    expect(exactBankSnapshots({ note: "no snapshot" })).toEqual([]);
  });
});

describe("activityEvidenceDocument", () => {
  it("carries checkpoint before/after, the bank snapshot text, and formatted money", () => {
    const doc = activityEvidenceDocument(event());
    expect(doc.title).toBe("Finance Activity — Imported Chase snapshot");
    expect(doc.summary.action).toBe("Bank snapshot");
    expect(doc.summary.accounts).toBe("Checking");
    expect(doc.summary.budgetMonths).toBe("2026-08");
    expect(doc.checkpoints?.accountPool).toBe("$80.00 → $70.00");
    expect(doc.checkpoints?.accounts[0]?.working).toBe("$100.00 → $90.00");
    expect(doc.checkpoints?.budgets[0]?.envelopes[0]?.detail).toContain(
      "Assigned $40.00 → $30.00",
    );
    expect(doc.snapshots).toEqual(["CHASE\nPosted: $90.00"]);
    expect(doc.changes[0]?.before).toContain("10000");
  });

  it("records a successful no-op when there are no normalized changes", () => {
    const doc = activityEvidenceDocument(event({ changes: [] }));
    expect(doc.changes).toEqual([]);
    const csv = serializeActivityExport("csv", doc, PINNED);
    expect(csv).toContain("Successful no-op.");
    const parsed = JSON.parse(serializeActivityExport("json", doc, PINNED)) as {
      changes: string;
    };
    expect(parsed.changes).toBe("Successful no-op.");
  });
});

describe("serializeActivityExport", () => {
  it("stamps every encoding with the same instant", () => {
    const doc = activityEvidenceDocument(event());
    const csv = serializeActivityExport("csv", doc, PINNED);
    const md = serializeActivityExport("markdown", doc, PINNED);
    const json = JSON.parse(serializeActivityExport("json", doc, PINNED)) as {
      exportedAt: string;
      title: string;
      sourceEvidence: { bankSnapshots: string[]; stored: Record<string, unknown> };
    };
    const yaml = serializeActivityExport("yaml", doc, PINNED);
    expect(parseCsvRows(csv)[0]).toEqual([
      "Finance Activity — Imported Chase snapshot",
    ]);
    expect(parseCsvRows(csv)[1]).toEqual(["Exported 2026-08-29T13:41:36-04:00"]);
    expect(csv).toContain("CHASE\nPosted: $90.00");
    expect(md.startsWith("# Finance Activity — Imported Chase snapshot\n")).toBe(true);
    expect(md).toContain("Exported 2026-08-29T13:41:36-04:00");
    expect(md).toContain("```\nCHASE\nPosted: $90.00\n```");
    expect(json.exportedAt).toBe("2026-08-29T13:41:36-04:00");
    expect(json.sourceEvidence.bankSnapshots).toEqual(["CHASE\nPosted: $90.00"]);
    expect(json.sourceEvidence.stored).toMatchObject({
      format: "planner-bank-snapshot-v1",
    });
    expect(yaml.startsWith('exportedAt: "2026-08-29T13:41:36-04:00"\n')).toBe(true);
    expect(yaml).toContain("accountPool: $80.00 → $70.00");
  });

  it("omits the warnings section when the event has none", () => {
    const doc = activityEvidenceDocument(event({ warnings: [] }));
    const csv = serializeActivityExport("csv", doc, PINNED);
    const json = JSON.parse(serializeActivityExport("json", doc, PINNED)) as {
      warnings?: string[];
    };
    expect(csv).not.toContain("Warnings & decisions");
    expect(json.warnings).toBeUndefined();
  });
});

describe("activityExportCommands", () => {
  it("lives in File ▸ Export Event with ids that cannot last-wins against the list export", () => {
    const commands = activityExportCommands(() => {}, true);
    expect(commands.map((command) => command.id)).toEqual([
      "activity.export-csv",
      "activity.export-json",
      "activity.export-yaml",
      "activity.export-markdown",
    ]);
    expect(commands[0]).toMatchObject({
      menu: "file",
      section: "Export Event",
      disabled: false,
    });
    expect(activityExportFormatOf("activity.export-csv")).toBe("csv");
    expect(activityExportFormatOf("grid.export-csv")).toBeNull();
    expect(unplacedCommands(commands)).toEqual([]);
    expect(toolbarWithoutMenu(commands)).toEqual([]);
  });

  it("stays visible and disabled until an event is loaded", () => {
    const [csv] = activityExportCommands(() => {}, false);
    expect(csv.disabled).toBe(true);
    expect(csv.title).toBe(ACTIVITY_EVENT_UNAVAILABLE);
    expect(activityCopyCommands(() => {}, false)[0]?.title).toBe(
      ACTIVITY_EVENT_UNAVAILABLE,
    );
  });

  it("folds Export Event after Copy to Clipboard", () => {
    const file = buildMenus([
      ...gridExportCommands(() => {}),
      ...gridCopyCommands(() => {}),
      ...activityExportCommands(() => {}, true),
      ...activityCopyCommands(() => {}, true),
      {
        id: "app.sign-out",
        label: "Sign out",
        group: "app",
        menu: "file",
        section: "Account",
        run: () => {},
      },
    ]).find((menu) => menu.id === "file");

    expect(
      file?.sections.map((section) => [section.label, section.submenu === true]),
    ).toEqual([
      ["Export", true],
      ["Copy to Clipboard", true],
      ["Export Event", true],
      ["Copy Event to Clipboard", true],
      ["Account", false],
    ]);
  });
});
