/**
 * One open Finance Activity event as a document — the drawer, as data.
 *
 * The grid already exports the six summary columns. This is the checkpoints, normalized
 * changes, and source evidence that live only in the drawer
 * (`agent-os/specs/2026-08-29-1349-export-stamps-and-activity` D4–D5). Same four encodings
 * and stamp as Budget; distinct command ids so they do not last-wins against the list export.
 */

import type { Command } from "@/lib/commands/registry";
import { escapeCsvField } from "@/lib/csv/text";
import {
  copyClipboardLabel,
  FORMAT_LABEL,
  formatExportStamp,
  GRID_EXPORT_FORMATS,
  tableToCsv,
  tableToMarkdown,
  yamlMapping,
  type ExportColumn,
  type GridExportDestination,
  type GridExportFormat,
  type YamlValue,
} from "@/lib/grid/exportCsv";
import { formatUsd } from "@/lib/finances/money";
import { financeAuditActionLabel } from "./labels";
import type { FinanceAuditEvent, FinanceMoneyCheckpoint } from "./types";

export const ACTIVITY_EVENT_UNAVAILABLE = "Open an Activity entry first";

export type ActivityEvidenceDocument = {
  title: string;
  summary: {
    time: string;
    action: string;
    origin: string;
    batch: string;
    headline: string;
    accounts: string;
    budgetMonths: string;
  };
  warnings: readonly string[];
  checkpoints: ActivityCheckpointSection | null;
  changes: readonly ActivityChangeRow[];
  snapshots: readonly string[];
  sourceEvidence: Record<string, unknown>;
};

export type ActivityCheckpointSection = {
  accountPool: string;
  selectedPending: string;
  accounts: readonly {
    name: string;
    working: string;
    selectedPending: string;
    reconciliation: string;
  }[];
  budgets: readonly {
    month: string;
    readyToAssign: string;
    reconciliation: string;
    uncategorized: string;
    envelopes: readonly { name: string; detail: string }[];
  }[];
};

export type ActivityChangeRow = {
  entityType: string;
  entityIdentity: string;
  before: string;
  after: string;
};

function moneyChange(before: number, after: number): string {
  return `${formatUsd(before)} → ${formatUsd(after)}`;
}

/** Walk stored evidence for `planner-bank-snapshot-v1` raw text — same walk the drawer uses. */
export function exactBankSnapshots(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(exactBankSnapshots);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own =
    record.format === "planner-bank-snapshot-v1" && typeof record.rawText === "string"
      ? [record.rawText]
      : [];
  return [
    ...own,
    ...Object.values(record).flatMap((child) => exactBankSnapshots(child)),
  ];
}

function checkpointSection(
  before: FinanceMoneyCheckpoint,
  after: FinanceMoneyCheckpoint,
): ActivityCheckpointSection {
  const beforeAccounts = new Map(before.accounts.map((row) => [row.accountId, row]));
  const afterAccounts = new Map(after.accounts.map((row) => [row.accountId, row]));
  const beforeBudgets = new Map(before.budgets.map((row) => [row.month, row]));
  const afterBudgets = new Map(after.budgets.map((row) => [row.month, row]));
  const accountIds = [...new Set([...beforeAccounts.keys(), ...afterAccounts.keys()])];
  const budgetMonths = [...new Set([...beforeBudgets.keys(), ...afterBudgets.keys()])];

  return {
    accountPool: moneyChange(before.accountPoolCents, after.accountPoolCents),
    selectedPending: moneyChange(
      before.selectedPendingCents,
      after.selectedPendingCents,
    ),
    accounts: accountIds.map((accountId) => {
      const prior = beforeAccounts.get(accountId);
      const account = afterAccounts.get(accountId);
      const display = account ?? prior!;
      return {
        name: display.accountName,
        working:
          prior && account
            ? moneyChange(prior.workingCents, account.workingCents)
            : account
              ? `Added at ${formatUsd(account.workingCents)}`
              : `Removed at ${formatUsd(prior!.workingCents)}`,
        selectedPending:
          prior && account
            ? moneyChange(prior.selectedPendingCents, account.selectedPendingCents)
            : "—",
        reconciliation:
          prior && account
            ? moneyChange(prior.reconciliationCents, account.reconciliationCents)
            : "—",
      };
    }),
    budgets: budgetMonths.map((month) => {
      const prior = beforeBudgets.get(month);
      const budget = afterBudgets.get(month);
      const display = budget ?? prior!;
      const beforeEnvelopes = new Map(
        (prior?.envelopes ?? []).map((envelope) => [envelope.envelopeId, envelope]),
      );
      const afterEnvelopes = new Map(
        (budget?.envelopes ?? []).map((envelope) => [envelope.envelopeId, envelope]),
      );
      const envelopeIds = [
        ...new Set([...beforeEnvelopes.keys(), ...afterEnvelopes.keys()]),
      ];
      return {
        month: month.slice(0, 7),
        readyToAssign:
          prior && budget
            ? moneyChange(prior.readyToAssignCents, budget.readyToAssignCents)
            : formatUsd(display.readyToAssignCents),
        reconciliation:
          prior && budget
            ? moneyChange(
                prior.accountReconciliationCents,
                budget.accountReconciliationCents,
              )
            : formatUsd(display.accountReconciliationCents),
        uncategorized:
          prior && budget
            ? moneyChange(
                prior.uncategorizedActivityCents,
                budget.uncategorizedActivityCents,
              )
            : formatUsd(display.uncategorizedActivityCents),
        envelopes: envelopeIds.map((envelopeId) => {
          const old = beforeEnvelopes.get(envelopeId);
          const envelope = afterEnvelopes.get(envelopeId);
          const envelopeDisplay = envelope ?? old!;
          return {
            name: envelopeDisplay.envelopeName,
            detail:
              old && envelope
                ? `Assigned ${moneyChange(old.assignedCents, envelope.assignedCents)} · Activity ${moneyChange(old.activityCents, envelope.activityCents)} · Available ${moneyChange(old.availableCents, envelope.availableCents)}`
                : envelope
                  ? `Added · Available ${formatUsd(envelope.availableCents)}`
                  : `Removed · Available ${formatUsd(old!.availableCents)}`,
          };
        }),
      };
    }),
  };
}

export function activityEvidenceDocument(
  event: FinanceAuditEvent,
): ActivityEvidenceDocument {
  return {
    title: `Finance Activity — ${event.summary}`,
    summary: {
      time: formatExportStamp(event.occurredAt).iso,
      action: financeAuditActionLabel(event.kind),
      origin: event.origin,
      batch: event.batchId,
      headline: event.summary,
      accounts: event.scope.accountNames?.join(", ") ?? "",
      budgetMonths:
        event.scope.budgetMonths?.map((month) => month.slice(0, 7)).join(", ") ?? "",
    },
    warnings: event.warnings,
    checkpoints:
      event.beforeCheckpoint && event.afterCheckpoint
        ? checkpointSection(event.beforeCheckpoint, event.afterCheckpoint)
        : null,
    changes: event.changes.map((change) => ({
      entityType: change.entityType,
      entityIdentity: change.entityIdentity,
      before: JSON.stringify(change.before, null, 2),
      after: JSON.stringify(change.after, null, 2),
    })),
    snapshots: exactBankSnapshots(event.sourceEvidence),
    sourceEvidence: event.sourceEvidence,
  };
}

type TwoCol = { label: string; value: string; depth: number };

const TWO_COL: ExportColumn<TwoCol>[] = [
  { id: "label", header: "Field", value: (row) => row.label },
  { id: "value", header: "Value", value: (row) => row.value },
];

const CHANGE_COL: ExportColumn<ActivityChangeRow & { depth: number }>[] = [
  { id: "type", header: "Entity type", value: (row) => row.entityType },
  { id: "id", header: "Identity", value: (row) => row.entityIdentity },
  { id: "before", header: "Before", value: (row) => row.before },
  { id: "after", header: "After", value: (row) => row.after },
];

function summaryRows(doc: ActivityEvidenceDocument): TwoCol[] {
  const { summary } = doc;
  return [
    { label: "Time", value: summary.time, depth: 0 },
    { label: "Action", value: summary.action, depth: 0 },
    { label: "Origin", value: summary.origin, depth: 0 },
    { label: "Batch", value: summary.batch, depth: 0 },
    { label: "Headline", value: summary.headline, depth: 0 },
    { label: "Accounts", value: summary.accounts, depth: 0 },
    { label: "Budget months", value: summary.budgetMonths, depth: 0 },
  ];
}

function checkpointRows(section: ActivityCheckpointSection): TwoCol[] {
  const rows: TwoCol[] = [
    { label: "Account pool", value: section.accountPool, depth: 0 },
    { label: "Selected pending", value: section.selectedPending, depth: 0 },
  ];
  for (const account of section.accounts) {
    rows.push({ label: account.name, value: "", depth: 0 });
    rows.push({ label: "Working balance", value: account.working, depth: 1 });
    rows.push({
      label: "Selected pending",
      value: account.selectedPending,
      depth: 1,
    });
    rows.push({ label: "Reconciliation", value: account.reconciliation, depth: 1 });
  }
  for (const budget of section.budgets) {
    rows.push({ label: `Budget ${budget.month}`, value: "", depth: 0 });
    rows.push({ label: "Ready to Assign", value: budget.readyToAssign, depth: 1 });
    rows.push({ label: "Reconciliation", value: budget.reconciliation, depth: 1 });
    rows.push({
      label: "Uncategorized activity",
      value: budget.uncategorized,
      depth: 1,
    });
    for (const envelope of budget.envelopes) {
      rows.push({ label: envelope.name, value: envelope.detail, depth: 2 });
    }
  }
  return rows;
}

export function serializeActivityExport(
  format: GridExportFormat,
  doc: ActivityEvidenceDocument,
  exportedAt: Date,
): string {
  if (format === "csv") return activityToCsv(doc, exportedAt);
  if (format === "markdown") return activityToMarkdown(doc, exportedAt);
  if (format === "json") {
    return `${JSON.stringify(activityToJson(doc, exportedAt), null, 2)}\n`;
  }
  return yamlMapping(activityToYamlObject(doc, exportedAt), 0);
}

function activityBody(
  doc: ActivityEvidenceDocument,
  exportedAt: Date,
): {
  exportedAt: string;
  title: string;
  summary: ActivityEvidenceDocument["summary"];
  warnings?: string[];
  checkpoints: ActivityCheckpointSection | string;
  changes: ActivityChangeRow[] | string;
} {
  return {
    exportedAt: formatExportStamp(exportedAt).iso,
    title: doc.title,
    summary: doc.summary,
    ...(doc.warnings.length > 0 ? { warnings: [...doc.warnings] } : {}),
    checkpoints: doc.checkpoints ?? "No checkpoint was recorded.",
    changes: doc.changes.length === 0 ? "Successful no-op." : [...doc.changes],
  };
}

function activityToJson(doc: ActivityEvidenceDocument, exportedAt: Date) {
  return {
    ...activityBody(doc, exportedAt),
    sourceEvidence: {
      ...(doc.snapshots.length > 0 ? { bankSnapshots: [...doc.snapshots] } : {}),
      stored: doc.sourceEvidence,
    },
  };
}

function activityToYamlObject(
  doc: ActivityEvidenceDocument,
  exportedAt: Date,
): Record<string, YamlValue> {
  const body = activityBody(doc, exportedAt);
  const checkpoints: YamlValue =
    typeof body.checkpoints === "string"
      ? body.checkpoints
      : {
          accountPool: body.checkpoints.accountPool,
          selectedPending: body.checkpoints.selectedPending,
          accounts: body.checkpoints.accounts.map((account) => ({ ...account })),
          budgets: body.checkpoints.budgets.map((budget) => ({
            month: budget.month,
            readyToAssign: budget.readyToAssign,
            reconciliation: budget.reconciliation,
            uncategorized: budget.uncategorized,
            envelopes: budget.envelopes.map((envelope) => ({ ...envelope })),
          })),
        };
  const changes: YamlValue =
    typeof body.changes === "string"
      ? body.changes
      : body.changes.map((change) => ({ ...change }));
  return {
    exportedAt: body.exportedAt,
    title: body.title,
    summary: { ...body.summary },
    ...(body.warnings ? { warnings: body.warnings } : {}),
    checkpoints,
    changes,
    sourceEvidence: {
      ...(doc.snapshots.length > 0 ? { bankSnapshots: [...doc.snapshots] } : {}),
      stored: JSON.stringify(doc.sourceEvidence),
    },
  };
}

function activityToCsv(doc: ActivityEvidenceDocument, exportedAt: Date): string {
  const lines: string[] = [
    escapeCsvField(doc.title),
    escapeCsvField(`Exported ${formatExportStamp(exportedAt).iso}`),
    "",
    "Summary",
    ...tableToCsv(TWO_COL, summaryRows(doc)).split("\n").slice(0, -1),
    "",
  ];
  if (doc.warnings.length > 0) {
    lines.push("Warnings & decisions");
    for (const warning of doc.warnings) lines.push(escapeCsvField(warning));
    lines.push("");
  }
  lines.push("Money checkpoints");
  if (doc.checkpoints) {
    lines.push(
      ...tableToCsv(TWO_COL, checkpointRows(doc.checkpoints)).split("\n").slice(0, -1),
    );
  } else {
    lines.push("No checkpoint was recorded.");
  }
  lines.push("");
  lines.push("Normalized changes");
  if (doc.changes.length === 0) {
    lines.push("Successful no-op.");
  } else {
    lines.push(
      ...tableToCsv(
        CHANGE_COL,
        doc.changes.map((change) => ({ ...change, depth: 0 })),
      )
        .split("\n")
        .slice(0, -1),
    );
  }
  lines.push("");
  lines.push("Source evidence");
  for (const snapshot of doc.snapshots) lines.push(escapeCsvField(snapshot));
  lines.push(escapeCsvField(JSON.stringify(doc.sourceEvidence, null, 2)));
  lines.push("");
  return lines.join("\n");
}

function activityToMarkdown(doc: ActivityEvidenceDocument, exportedAt: Date): string {
  const blocks: string[] = [
    `# ${doc.title}`,
    `Exported ${formatExportStamp(exportedAt).iso}`,
    "## Summary",
    tableToMarkdown(TWO_COL, summaryRows(doc)).trimEnd(),
  ];
  if (doc.warnings.length > 0) {
    blocks.push(
      "## Warnings & decisions",
      doc.warnings.map((warning) => `- ${warning}`).join("\n"),
    );
  }
  blocks.push("## Money checkpoints");
  if (doc.checkpoints) {
    blocks.push(
      tableToMarkdown(
        TWO_COL,
        checkpointRows(doc.checkpoints),
        (row) => row.depth,
      ).trimEnd(),
    );
  } else {
    blocks.push("No checkpoint was recorded.");
  }
  blocks.push("## Normalized changes");
  if (doc.changes.length === 0) {
    blocks.push("Successful no-op.");
  } else {
    blocks.push(
      tableToMarkdown(
        CHANGE_COL,
        doc.changes.map((change) => ({ ...change, depth: 0 })),
      ).trimEnd(),
    );
  }
  blocks.push("## Source evidence");
  for (const snapshot of doc.snapshots) {
    blocks.push(`\`\`\`\n${snapshot}\n\`\`\``);
  }
  blocks.push(`\`\`\`json\n${JSON.stringify(doc.sourceEvidence, null, 2)}\n\`\`\``);
  return `${blocks.join("\n\n")}\n`;
}

export function activityExportFormatOf(id: string): GridExportFormat | null {
  for (const format of GRID_EXPORT_FORMATS) {
    if (id === `activity.export-${format}` || id === `activity.copy-${format}`) {
      return format;
    }
  }
  return null;
}

const EXPORT_TITLE: Record<GridExportFormat, string> = {
  csv: "Download this event's evidence as CSV",
  json: "Download this event's evidence as JSON",
  yaml: "Download this event's evidence as YAML",
  markdown: "Download this event's evidence as Markdown",
};

export function activityExportCommands(
  run: (format: GridExportFormat, destination?: GridExportDestination) => void,
  loaded: boolean,
): Command[] {
  return GRID_EXPORT_FORMATS.map((format) => ({
    id: `activity.export-${format}`,
    label: FORMAT_LABEL[format],
    group: "view",
    menu: "file",
    section: "Export Event",
    icon: "export",
    keywords: `export event activity evidence audit ${format}`,
    disabled: !loaded,
    title: loaded ? EXPORT_TITLE[format] : ACTIVITY_EVENT_UNAVAILABLE,
    alternate: {
      label: copyClipboardLabel(format),
      title: loaded
        ? `Copy this event's evidence as ${FORMAT_LABEL[format]} to the clipboard`
        : ACTIVITY_EVENT_UNAVAILABLE,
      run: () => run(format, "clipboard"),
    },
    run: () => run(format, "file"),
  }));
}

export function activityCopyCommands(
  run: (format: GridExportFormat) => void,
  loaded: boolean,
): Command[] {
  return GRID_EXPORT_FORMATS.map((format) => ({
    id: `activity.copy-${format}`,
    label: copyClipboardLabel(format),
    group: "view",
    menu: "file",
    section: "Copy Event to Clipboard",
    icon: "copy",
    keywords: `copy clipboard event activity evidence ${format}`,
    disabled: !loaded,
    title: loaded
      ? `Copy this event's evidence as ${FORMAT_LABEL[format]} to the clipboard`
      : ACTIVITY_EVENT_UNAVAILABLE,
    run: () => run(format),
  }));
}
