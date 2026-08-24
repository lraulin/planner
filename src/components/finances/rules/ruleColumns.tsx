"use client";

import type { ColumnDef } from "@/components/grid/columns";
import { summarizeActions, type RuleAction } from "@/lib/finances/rules/actions";
import type { RuleRow } from "@/lib/finances/rules/queries";
import { summarizeConditions } from "@/lib/finances/rules/summary";

export type RuleColumnCtx = {
  pending: boolean;
  onToggleEnabled: (ruleId: string, enabled: boolean) => void;
  priorityById: ReadonlyMap<string, number>;
};

export const RULE_COLUMN_IDS = [
  "priority",
  "name",
  "conditions",
  "actions",
  "enabled",
  "matches",
  "notes",
] as const;

function Text({ value, muted = true }: { value: string; muted?: boolean }) {
  return (
    <span
      className={`truncate text-[0.8125rem] ${muted ? "text-ink-muted" : "text-ink"}`}
      title={value || undefined}
    >
      {value}
    </span>
  );
}

/**
 * Actions render from the raw blob too.
 *
 * A rule the parser rejects still has to appear — the grid is where it gets fixed — so this
 * degrades rather than assuming the stored shape is valid.
 */
function actionText(row: RuleRow): string {
  return Array.isArray(row.actions)
    ? summarizeActions(row.actions as RuleAction[], row.names)
    : "nothing";
}

export const ruleColumns: ColumnDef<RuleColumnCtx, RuleRow>[] = [
  {
    id: "priority",
    label: "Priority",
    width: "5rem",
    hideable: false,
    render: (row, ctx) => (
      <span className="tabular-nums text-[0.8125rem] text-ink-muted">
        {ctx.priorityById.get(row.node.id)}
      </span>
    ),
  },
  {
    id: "name",
    label: "Rule",
    width: "minmax(10rem,1fr)",
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name || null,
    sortValue: (row) => row.node.sortKey,
    compact: "primary",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Text value={row.node.name} muted={false} />
        {row.node.problem && (
          // A rule that cannot compile does not run. Saying so here is the difference between
          // "this is off" and "this is silently doing nothing".
          <span
            className="shrink-0 text-[0.75rem] text-priority-a"
            title={row.node.problem}
          >
            broken
          </span>
        )}
      </span>
    ),
  },
  {
    id: "conditions",
    label: "When",
    width: "minmax(14rem,1.6fr)",
    filterKind: "text",
    filterValue: (row) =>
      summarizeConditions(row.node.conditions, row.node.names) || null,
    render: (row) => (
      <Text value={summarizeConditions(row.node.conditions, row.node.names)} />
    ),
  },
  {
    id: "actions",
    label: "Then",
    width: "minmax(10rem,1fr)",
    filterKind: "text",
    filterValue: (row) => actionText(row.node) || null,
    render: (row) => <Text value={actionText(row.node)} />,
  },
  {
    id: "enabled",
    label: "On",
    width: "4rem",
    filterKind: "enum",
    filterValue: (row) => (row.node.enabled ? "On" : "Off"),
    sortValue: (row) => (row.node.enabled ? 0 : 1),
    render: (row, ctx) => (
      <input
        type="checkbox"
        checked={row.node.enabled}
        disabled={ctx.pending}
        aria-label={`${row.node.name} is on`}
        onChange={(event) => ctx.onToggleEnabled(row.node.id, event.target.checked)}
      />
    ),
  },
  {
    id: "matches",
    label: "Matches",
    width: "5.5rem",
    filterKind: "enum",
    filterValue: (row) => String(row.node.matchCount),
    render: (row) => (
      <span className="tabular-nums text-[0.8125rem] text-ink-muted">
        {row.node.matchCount.toLocaleString()}
      </span>
    ),
  },
  {
    id: "notes",
    label: "Why",
    width: "minmax(8rem,1.2fr)",
    filterKind: "text",
    filterValue: (row) => row.node.notes || null,
    render: (row) => <Text value={row.node.notes} />,
  },
];
