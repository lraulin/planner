"use client";

import { useMemo, useState } from "react";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { useToday } from "@/components/grid/useToday";
import { KIND_LABELS, kindOfNode } from "@/lib/tree/hierarchy";
import type { OutlineNode } from "@/lib/tree/types";
import { projectPickerRows } from "@/lib/projects/picker";

export type ProjectPickerValue =
  { kind: "all" } | { kind: "none" } | { kind: "project"; projectId: string };

export function ProjectPicker({
  nodes,
  value,
  onChange,
  allowAll = false,
  allowNone = false,
  excludedIds,
  listClassName = "max-h-[42dvh]",
}: {
  nodes: readonly OutlineNode[];
  value: ProjectPickerValue;
  onChange: (value: ProjectPickerValue) => void;
  allowAll?: boolean;
  allowNone?: boolean;
  excludedIds?: ReadonlySet<string>;
  listClassName?: string;
}) {
  const today = useToday();
  const [query, setQuery] = useState("");
  const [groupByResultArea, setGroupByResultArea] = useState(true);
  const [includeDeferred, setIncludeDeferred] = useState(false);
  const rows = useMemo(
    () =>
      projectPickerRows(nodes, {
        query,
        groupByResultArea,
        includeDeferred,
        today,
        excludedIds,
      }),
    [nodes, query, groupByResultArea, includeDeferred, today, excludedIds],
  );

  return (
    <div className="min-w-0">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter projects…"
          aria-label="Filter projects"
          className="min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface px-3 text-[0.8125rem] text-ink outline-none focus:border-select-edge"
        />
        <button
          type="button"
          onClick={() => setQuery("")}
          className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          Clear
        </button>
      </div>

      <div
        className={`mt-3 overflow-y-auto rounded border border-rule ${listClassName}`}
      >
        {allowAll && (
          <PickerRow
            label="All Projects"
            selected={value.kind === "all"}
            onClick={() => onChange({ kind: "all" })}
          />
        )}
        {allowNone && (
          <PickerRow
            label="No Project"
            selected={value.kind === "none"}
            onClick={() => onChange({ kind: "none" })}
          />
        )}
        {rows.map((row) => {
          const selected = value.kind === "project" && value.projectId === row.id;
          const kind = kindOfNode({ type: row.type });
          return (
            <button
              key={row.id}
              type="button"
              onClick={() =>
                row.selectable && onChange({ kind: "project", projectId: row.id })
              }
              disabled={!row.selectable}
              aria-pressed={selected}
              className={`flex min-h-tap w-full items-center gap-2 border-b border-rule px-3 py-2 text-left last:border-b-0 ${
                selected
                  ? "bg-select/60"
                  : row.selectable
                    ? "hover:bg-surface-raised"
                    : "bg-surface-raised/35"
              } ${row.disabled ? "opacity-45" : ""}`}
              style={{ paddingLeft: `${0.75 + Math.min(row.depth, 7) * 0.75}rem` }}
            >
              <TypeIcon kind={kind} className="h-4 w-4 flex-none" />
              <span
                className={`min-w-0 flex-1 truncate text-[0.8125rem] ${
                  row.selectable ? "text-ink" : "font-medium text-ink-muted"
                }`}
              >
                {row.name || "Untitled project"}
              </span>
              {row.priority && (
                <span className="tabular flex-none font-mono text-[0.6875rem] text-ink-faint">
                  {row.priority}
                </span>
              )}
              {!row.selectable && (
                <span className="flex-none text-[0.625rem] uppercase tracking-wide text-ink-faint">
                  {KIND_LABELS[kind]}
                </span>
              )}
            </button>
          );
        })}
        {rows.length === 0 && !allowAll && !allowNone && (
          <p className="px-3 py-5 text-[0.8125rem] text-ink-muted">
            No projects match.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.75rem] text-ink-muted">
        <label className="flex min-h-tap items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={groupByResultArea}
            onChange={(event) => setGroupByResultArea(event.target.checked)}
          />
          Group by Result Area
        </label>
        <label className="flex min-h-tap items-center gap-2 md:min-h-0">
          <input
            type="checkbox"
            checked={includeDeferred}
            onChange={(event) => setIncludeDeferred(event.target.checked)}
          />
          Show Postponed
        </label>
      </div>
    </div>
  );
}

function PickerRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-tap w-full items-center border-b border-rule px-3 py-2 text-left text-[0.8125rem] ${
        selected
          ? "bg-select/60 font-medium text-ink"
          : "text-ink-muted hover:bg-surface-raised"
      }`}
    >
      &lt;{label}&gt;
    </button>
  );
}
