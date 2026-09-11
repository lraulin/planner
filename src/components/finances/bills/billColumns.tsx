"use client";
import { useRef, useState } from "react";
import type { ColumnDef } from "@/components/grid/columns";
import { TextCell, AmountCell, DateKeyCell } from "@/components/grid/cells";
import { DateText } from "@/components/date/DateText";
import { CadenceSelect } from "../CadenceSelect";
import { UrlCell } from "../budget/UrlCell";
import {
  billCadence,
  billInspectorView,
  declaresBillSchedule,
} from "@/lib/finances/budget/inspector";
import { formatUsd } from "@/lib/finances/money";
import type { BudgetBillRow } from "@/lib/finances/budget/rows";
import type { BillPatch } from "../budget/budgetColumns";
import type { BudgetCategoryEdit } from "@/lib/finances/budget/mutations";
import type { EnvelopeStatus } from "@/db/schema";

export type BillGridRow = BudgetBillRow & {
  groupName: string;
  lastCharge: string | null;
  payeeNames: string;
  /** Whole days to next charge, from `data.todayKey`. Null when there is no date. */
  daysRemaining: number | null;
};
export type BillColumnCtx = {
  pending: boolean;
  editPayees: (row: BudgetBillRow) => void;
  groups: readonly { id: string; name: string }[];
  patch: (row: BudgetBillRow, edit: BillPatch) => void;
  edit: (id: string, edit: BudgetCategoryEdit) => void;
  /** The row whose name is currently an input, if any. */
  renamingId: string | null;
  /** Enter or blur. An unchanged or empty name is a cancel, not a write. */
  onRename: (id: string, name: string) => void;
  /** Escape. */
  onCancelRename: () => void;
};

/** Hover prose for the integer — Agenda's display, kept here so the helpers stay apart. */
function daysRemainingTitle(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}

/**
 * The name cell while it is being renamed.
 *
 * Same contract as Budget's inline rename: commit on Enter/blur, revert on Escape,
 * empty or unchanged is cancel. Copied rather than imported — Budget's name cell
 * also carries funding chrome this page must not take on.
 */
function RenameInput({
  initial,
  label,
  disabled,
  onCommit,
  onCancel,
}: {
  initial: string;
  label: string;
  disabled: boolean;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  // Escape reverts, so a blur that follows it must not then commit the reverted text.
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      aria-label={label}
      value={value}
      disabled={disabled}
      className="min-h-tap w-full min-w-0 rounded border border-select-edge bg-surface px-1 text-base text-ink md:min-h-0 md:text-xs"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (cancelled.current) return;
        onCommit(value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
    />
  );
}
const field =
  "min-h-tap w-full rounded border border-rule bg-surface px-1 text-base md:min-h-0 md:text-xs";
export const billColumns: ColumnDef<BillColumnCtx, BillGridRow>[] = [
  {
    id: "name",
    label: "Bill",
    width: "18rem",
    hideable: false,
    compact: "primary",
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name,
    render: (row, ctx) =>
      ctx.renamingId === row.node.id ? (
        <RenameInput
          initial={row.node.name}
          label={`Name for ${row.node.name}`}
          disabled={ctx.pending}
          onCommit={(name) => ctx.onRename(row.node.id, name)}
          onCancel={ctx.onCancelRename}
        />
      ) : (
        <span className="truncate text-[0.8125rem] font-medium text-ink">
          {row.node.name}
        </span>
      ),
  },
  {
    id: "budgetGroup",
    label: "Group",
    width: "10rem",
    compact: "meta",
    filterKind: "enum",
    filterValue: (row) => row.node.groupName,
    sortValue: (row) => row.node.groupName,
    render: (row, ctx) => (
      <select
        aria-label={`Group for ${row.node.name}`}
        className={field}
        value={row.node.groupId ?? ""}
        disabled={ctx.pending}
        onChange={(event) => ctx.edit(row.id, { groupId: event.target.value || null })}
      >
        <option value="">Ungrouped</option>
        {ctx.groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    ),
  },
  {
    id: "next",
    label: "Next charge",
    width: "10rem",
    compact: "meta",
    filterKind: "date",
    filterValue: (row) => row.node.nextDueKey,
    sortValue: (row) => row.node.nextDueKey,
    // The phone reads the same three answers the cell gives, not just the date half.
    compactText: (row) =>
      row.node.bill.status === "cancelled"
        ? null
        : !row.node.bill.scheduled
          ? "Unscheduled"
          : row.node.nextDueKey,
    render: (row, ctx) =>
      row.node.bill.status === "cancelled" ? (
        <span>—</span>
      ) : !row.node.bill.scheduled ? (
        <span className="text-xs text-ink-muted">Unscheduled</span>
      ) : declaresBillSchedule(row.node.bill) ? (
        // Derived, not typed: two writable sources for one date is how `anchorDate`
        // acquired three meanings (D5).
        <DateText
          dateKey={row.node.nextDueKey}
          fallback="—"
          className="text-xs"
          title={`Set by the due day (${row.node.bill.dueDay}) and a ${row.node.bill.leadDays}-day payment lead. Clear the due day to type a date.`}
        />
      ) : (
        <DateKeyCell
          value={row.node.nextDueKey ?? ""}
          ariaLabel={`Next charge for ${row.node.name}`}
          disabled={ctx.pending}
          align="left"
          onChange={(anchorDate) => ctx.patch(row.node, { anchorDate })}
        />
      ),
  },
  {
    id: "daysRemaining",
    label: "Days remaining",
    width: "7rem",
    compact: "meta",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.daysRemaining === null ? null : String(row.node.daysRemaining),
    sortValue: (row) => row.node.daysRemaining,
    compactText: (row) =>
      row.node.daysRemaining === null ? "—" : String(row.node.daysRemaining),
    render: (row) => {
      const days = row.node.daysRemaining;
      if (days === null) return <span className="text-xs text-ink-muted">—</span>;
      return (
        <span
          title={daysRemainingTitle(days)}
          className={`tabular block text-right text-xs ${
            days < 0 ? "text-ink-faint" : days === 0 ? "text-ink" : "text-ink-muted"
          }`}
        >
          {days}
        </span>
      );
    },
  },
  {
    id: "due",
    label: "Due",
    width: "10rem",
    compact: "meta",
    filterKind: "date",
    filterValue: (row) => row.node.dueKey,
    sortValue: (row) => row.node.dueKey,
    // The contract date, as distinct from Next charge, which stays the posting date the
    // envelope funds. Only a bill that declares a due day has one to show.
    render: (row) => (
      <DateText dateKey={row.node.dueKey} fallback="—" className="text-xs" />
    ),
  },
  {
    id: "amount",
    label: "Amount",
    width: "8rem",
    compact: "meta",
    align: "right",
    filterKind: "number",
    filterValue: (row) =>
      row.node.bill.expectedCents === null
        ? null
        : formatUsd(row.node.bill.expectedCents),
    sortValue: (row) => row.node.bill.expectedCents,
    render: (row, ctx) => (
      <div>
        {row.node.bill.expectedCents === null ? (
          <span className="text-xs text-ink-muted">Amount missing</span>
        ) : null}
        <AmountCell
          cents={row.node.bill.expectedCents}
          label={`Amount for ${row.node.name}`}
          disabled={ctx.pending}
          className={field}
          onCommit={(expectedCents) => ctx.patch(row.node, { expectedCents })}
        />
      </div>
    ),
  },
  {
    id: "cadence",
    label: "Cadence",
    width: "9rem",
    compact: "meta",
    filterKind: "enum",
    filterValue: (row) => billInspectorView(row.node.bill).cadenceCaption,
    sortValue: (row) => billInspectorView(row.node.bill).cadenceCaption,
    render: (row, ctx) => (
      <CadenceSelect
        value={billCadence(row.node.bill)}
        disabled={ctx.pending}
        ariaLabel={`Cadence for ${row.node.name}`}
        className={field}
        onChange={(cadence) => ctx.patch(row.node, { cadence })}
      />
    ),
  },
  {
    id: "status",
    label: "Status",
    width: "8rem",
    compact: "meta",
    filterKind: "enum",
    filterValue: (row) => row.node.bill.status,
    sortValue: (row) => row.node.bill.status,
    render: (row, ctx) => (
      <select
        className={field}
        aria-label={`Status for ${row.node.name}`}
        value={row.node.bill.status}
        disabled={ctx.pending}
        onChange={(event) =>
          ctx.patch(row.node, { status: event.target.value as EnvelopeStatus })
        }
      >
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="cancelled">Cancelled</option>
      </select>
    ),
  },
  ...(["monthlyCents", "annualCents"] as const).map(
    (id): ColumnDef<BillColumnCtx, BillGridRow> => ({
      id,
      label: id === "monthlyCents" ? "Monthly cost" : "Yearly cost",
      width: "8rem",
      align: "right",
      filterKind: "number",
      sortValue: (row) => billInspectorView(row.node.bill)[id],
      render: (row) => (
        <span className="tabular text-xs">
          {row.node.bill.status === "cancelled"
            ? "—"
            : row.node.bill.expectedCents === null
              ? "Unknown"
              : formatUsd(billInspectorView(row.node.bill)[id])}
        </span>
      ),
    }),
  ),
  {
    id: "last",
    label: "Last charge",
    width: "8rem",
    filterKind: "date",
    filterValue: (row) => row.node.lastCharge,
    sortValue: (row) => row.node.lastCharge,
    render: (row) => <span className="text-xs">{row.node.lastCharge ?? "—"}</span>,
  },
  {
    id: "payees",
    label: "Payees",
    width: "12rem",
    filterKind: "text",
    filterValue: (row) => row.node.payeeNames,
    sortValue: (row) => row.node.payeeNames,
    render: (row, ctx) => (
      <button
        type="button"
        className="truncate text-xs underline"
        onClick={() => ctx.editPayees(row.node)}
      >
        {row.node.payeeNames || "Choose payees…"}
      </button>
    ),
  },
  {
    id: "url",
    label: "Website",
    width: "10rem",
    filterKind: "text",
    filterValue: (row) => row.node.bill.url,
    render: (row, ctx) => (
      <UrlCell
        value={row.node.bill.url}
        label={row.node.name}
        disabled={ctx.pending}
        onCommit={(url) => ctx.patch(row.node, { url })}
      />
    ),
  },
  {
    id: "notes",
    label: "Notes",
    width: "12rem",
    filterKind: "text",
    filterValue: (row) => row.node.notes,
    render: (row, ctx) => (
      <TextCell
        value={row.node.notes}
        ariaLabel={`Notes for ${row.node.name}`}
        onChange={(notes) => ctx.edit(row.id, { notes })}
      />
    ),
  },
];
