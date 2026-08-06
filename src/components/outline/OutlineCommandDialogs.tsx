"use client";

import { useId, useMemo, useState } from "react";
import { KIND_LABELS, kindOfNode } from "@/lib/tree/hierarchy";
import type { OutlineNode } from "@/lib/tree/types";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { ModalShell } from "@/components/detail/ModalShell";
import { resolvePickerSelection } from "@/lib/grid/pickerSelection";

export function OutlineZoomDialog({
  open,
  nodes,
  initialId,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  nodes: readonly OutlineNode[];
  initialId?: string | null;
  onConfirm: (nodeId: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(initialId ?? null);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return nodes
      .filter((node) => !needle || node.name.toLocaleLowerCase().includes(needle))
      .slice(0, 200);
  }, [nodes, query]);

  // Never confirm a row the query has filtered off screen — see `resolvePickerSelection`.
  const selectedId = resolvePickerSelection(matches, pickedId);

  return (
    <ModalShell open={open} onClose={onCancel} labelledBy={titleId} width="max-w-xl">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Zoom to item
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Choose the branch root to show in the outline.
        </p>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items…"
          aria-label="Search items to zoom to"
          className="mt-3 min-h-tap w-full rounded border border-rule bg-surface px-3 text-[0.8125rem] text-ink outline-none focus:border-select-edge"
        />

        <div className="mt-3 max-h-[42dvh] overflow-y-auto rounded border border-rule">
          {matches.length === 0 ? (
            <p className="px-3 py-4 text-[0.8125rem] text-ink-muted">
              No matching items.
            </p>
          ) : (
            matches.map((node) => {
              const kind = kindOfNode(node);
              const selected = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setPickedId(node.id)}
                  className={`flex min-h-tap w-full items-center gap-2 border-b border-rule px-3 py-2 text-left last:border-b-0 ${selected ? "bg-select/45" : "hover:bg-surface-raised"}`}
                  style={{ paddingLeft: `${0.75 + Math.min(node.depth, 8) * 0.75}rem` }}
                  aria-pressed={selected}
                >
                  <TypeIcon kind={kind} className="h-4 w-4 flex-none" />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                    {node.name || "Untitled item"}
                  </span>
                  <span className="flex-none text-[0.6875rem] text-ink-faint">
                    {KIND_LABELS[kind]}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId}
            className="rounded bg-select-edge px-3 py-1.5 text-[0.8125rem] text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Zoom in
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function ExpandLevelDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (level: number) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [level, setLevel] = useState(3);

  return (
    <ModalShell open={open} onClose={onCancel} labelledBy={titleId} width="max-w-sm">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Expand through level
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Show descendants through the selected outline depth.
        </p>
        <label
          className="mt-4 block text-[0.75rem] font-medium text-ink-muted"
          htmlFor="expand-level"
        >
          Level
        </label>
        <select
          id="expand-level"
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
          className="mt-1 min-h-tap w-full rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink outline-none focus:border-select-edge"
        >
          {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              Level {value}
            </option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(level)}
            className="rounded bg-select-edge px-3 py-1.5 text-[0.8125rem] text-white hover:brightness-95"
          >
            Expand
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
