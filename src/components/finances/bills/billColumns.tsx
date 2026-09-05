"use client";
import type { ColumnDef } from "@/components/grid/columns";
import { TextCell, AmountCell, DateKeyCell } from "@/components/grid/cells";
import { CadenceSelect } from "../CadenceSelect";
import { UrlCell } from "../budget/UrlCell";
import { billCadence, billInspectorView } from "@/lib/finances/budget/inspector";
import { formatUsd } from "@/lib/finances/money";
import type { BudgetBillRow } from "@/lib/finances/budget/rows";
import type { BillPatch } from "../budget/budgetColumns";
import type { BudgetCategoryEdit } from "@/lib/finances/budget/mutations";
import type { EnvelopeStatus } from "@/db/schema";

export type BillGridRow = BudgetBillRow & {
  groupName: string;
  lastCharge: string | null;
  payeeNames: string;
};
export type BillColumnCtx = {
  pending: boolean;
  editPayees: (row: BudgetBillRow) => void;
  groups: readonly { id: string; name: string }[];
  patch: (row: BudgetBillRow, edit: BillPatch) => void;
  edit: (id: string, edit: BudgetCategoryEdit) => void;
};
const field =
  "min-h-tap w-full rounded border border-rule bg-surface px-1 text-base md:min-h-0 md:text-xs";
export const billColumns: ColumnDef<BillColumnCtx, BillGridRow>[] = [
  {
    id: "name",
    label: "Bill",
    width: "minmax(12rem,1fr)",
    hideable: false,
    compact: "primary",
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name,
    render: (row, ctx) => (
      <TextCell
        value={row.node.name}
        ariaLabel={`Name for ${row.node.name}`}
        onChange={(name) => ctx.edit(row.id, { name })}
      />
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
    render: (row, ctx) =>
      row.node.bill.status === "cancelled" ? (
        <span>—</span>
      ) : !row.node.bill.scheduled ? (
        <span className="text-xs text-ink-muted">Unscheduled</span>
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
