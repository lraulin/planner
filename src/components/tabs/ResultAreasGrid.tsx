"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { OutlineWire } from "@/lib/tree/wire";
import { asGroupBy, treeGridRows, type GroupBy } from "@/lib/tree/slice";
import type { ColumnDef } from "@/components/grid/columns";
import type { GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import {
  actualEffortColumn,
  categoryColumn,
  contextsColumn,
  dateCreatedColumn,
  dateModifiedColumn,
  descriptionColumn,
  effortLeftColumn,
  percentColumn,
} from "@/components/grid/commonColumns";
import { NameCell, TextCell } from "@/components/grid/cells";
import { setResultAreaFieldsAction } from "@/app/(shell)/plan/outline/detail-actions";
import { useGridTab } from "./useGridTab";
import { NodeTabGrid, useNodeTabCommands } from "./NodeTabGrid";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

type ViewId = "all";

/**
 * One built-in view. A person has eight or ten result areas, so slicing is not what this
 * list is for.
 *
 * A "By Importance" preset would have been the obvious second one — Achieve's whole premise
 * is that the areas are weighted against each other, and that comparison is unreadable in
 * name order. `GridDefaults` carries order, grouping, filters and switches but **not sorts**,
 * so a built-in view cannot preset one. Sorts do persist per view, so sorting by Importance
 * and saving that as a named view gets there by the route saved views exist for.
 */
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "all", label: "All Result Areas" },
];

const DEFAULT_ORDER = [
  "category",
  "name",
  "importance",
  "description",
  "percent",
  "effortLeft",
];

function viewDefaults(): GridDefaults {
  return { order: DEFAULT_ORDER };
}

type ResultAreasCtx = OutlineColumnCtx & {
  onCategoryChange: (node: OutlineNode, value: string) => void;
  onImportanceChange: (node: OutlineNode, value: number | null) => void;
  onDescriptionChange: (node: OutlineNode, value: string) => void;
};

function buildColumns(): ColumnDef<ResultAreasCtx>[] {
  return [
    {
      ...categoryColumn(),
      render: (row, ctx) => (
        <TextCell
          key={`cat:${row.node.category ?? ""}`}
          value={row.node.category ?? ""}
          ariaLabel="Category"
          onChange={(value) => ctx.onCategoryChange(row.node, value)}
        />
      ),
    },
    {
      id: "name",
      label: "Result Area",
      width: "18rem",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => row.node.name,
      sortValue: (row) => row.node.name.toLowerCase(),
      render: (row, ctx) => (
        <NameCell
          node={row.node}
          depth={0}
          dragHandle
          editing={row.node.id === ctx.editingId}
          onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
          onOpenDetail={() => ctx.onOpenDetail(row.node)}
          onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
          onCancelEdit={ctx.onCancelEdit}
        />
      ),
    },
    {
      id: "importance",
      label: "Importance",
      width: "6rem",
      align: "right",
      filterKind: "text",
      filterValue: (row) =>
        row.node.importance === null ? null : String(row.node.importance),
      sortValue: (row) => row.node.importance,
      render: (row, ctx) => (
        <ImportanceCell
          key={`imp:${row.node.importance ?? ""}`}
          value={row.node.importance}
          onChange={(value) => ctx.onImportanceChange(row.node, value)}
        />
      ),
    },
    {
      ...descriptionColumn(),
      render: (row, ctx) => (
        <TextCell
          key={`desc:${row.node.description}`}
          value={row.node.description}
          ariaLabel="Description"
          onChange={(value) => ctx.onDescriptionChange(row.node, value)}
        />
      ),
    },
    // Rollups over everything under the area — read-only, and the point of the tab: how much
    // of your committed work actually sits under the areas you called important.
    percentColumn(),
    effortLeftColumn(),
    // Optional fields — available via Show Fields; not in DEFAULT_ORDER.
    actualEffortColumn(),
    contextsColumn(),
    dateCreatedColumn(),
    dateModifiedColumn(),
  ] as ColumnDef<ResultAreasCtx>[];
}

/** Category is the only dimension a flat list of result areas can meaningfully group by. */
const RESULT_AREA_GROUP_DIMENSIONS: GroupBy[] = ["category"];

/** Module scope so the identity is stable — see the note in `useNodeCommandDeck`. */
const RESULT_AREA_CREATE_KINDS = ["result_area"] as const;

/**
 * Result Areas module — Achieve's `Go -> Result Areas` (manual §10.2).
 *
 * The rows have always existed as the outline's top level; what this adds is seeing them
 * *as a set*, with their weights side by side and the work beneath each one rolled up.
 * Editing a name, category, importance or description happens here; everything else is the
 * existing Result Area drawer.
 */
export function ResultAreasGrid({ wire }: { wire: OutlineWire }) {
  const tab = useGridTab(wire);
  // Result areas are the outline's top level, so there is no scope to create into — and a
  // sub-area is the one nesting this module can express, which `New sub-area` now does.
  const nodeCommands = useNodeTabCommands(tab, { kinds: RESULT_AREA_CREATE_KINDS });

  const allColumns = useMemo(() => buildColumns(), []);
  const views = useModuleViews({
    moduleId: "result-areas",
    builtIn: VIEWS,
    defaultViewId: "all",
    columns: allColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const preparedRows = useMemo(
    () =>
      treeGridRows(tab.nodes, {
        keep: (node) => node.type === "result_area",
        groupBy: asGroupBy(gridState.groupBy),
        scopeId: null,
        includeDeferred: true,
        today: tab.today,
      }),
    [tab.nodes, tab.today, gridState.groupBy],
  );
  const { rows, narrowingRows } = preparedRows;

  const columnCtx: ResultAreasCtx = useMemo(
    () => ({
      ...tab.cellHandlers,
      onCategoryChange: (node, value) => {
        const next = value.trim() || null;
        tab.patch(node.id, { category: next });
        tab.apply(() => setResultAreaFieldsAction(node.id, { category: next }));
      },
      onImportanceChange: (node, value) => {
        tab.patch(node.id, { importance: value });
        tab.apply(() => setResultAreaFieldsAction(node.id, { importance: value }));
      },
      onDescriptionChange: (node, value) => {
        tab.patch(node.id, { description: value });
        tab.apply(() => setResultAreaFieldsAction(node.id, { description: value }));
      },
    }),
    [tab],
  );

  return (
    <NodeTabGrid
      tab={tab}
      commands={nodeCommands}
      views={views}
      label="Result Areas"
      noun="result areas"
      allColumns={allColumns}
      columnCtx={columnCtx}
      rows={rows}
      narrowingRows={narrowingRows}
      groupDimensions={RESULT_AREA_GROUP_DIMENSIONS}
    />
  );
}

/**
 * Achieve's 0–100 weighting. Out-of-range input clamps rather than rejecting: the value is
 * a rough weight, and refusing "150" teaches nothing that clamping to 100 does not.
 */
function ImportanceCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const current = value === null ? "" : String(value);
  const [draft, setDraft] = useState(current);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraft(current);
      return;
    }
    const clamped = Math.min(100, Math.max(0, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(current);
          event.currentTarget.blur();
        }
      }}
      aria-label="Importance"
      placeholder="—"
      inputMode="numeric"
      maxLength={3}
      className="tabular w-full border-none bg-transparent text-right text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint/50"
    />
  );
}
