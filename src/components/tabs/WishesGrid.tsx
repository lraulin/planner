"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { PriorityLetter } from "@/db/schema";
import { formatPriority, parsePriority } from "@/lib/tree/format";
import { WISH_TYPE_CODES, type WishListRow } from "@/lib/detail/wishTypes";
import { updateNodeItemAction } from "@/app/outline/detail-actions";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { ContextMenu } from "@/components/grid/ContextMenu";
import { ErrorBanner, TabToolbar, ToolbarButton, ToolbarSelect } from "./tabChrome";

/**
 * Wish List is the only tab whose rows are `node_items`, not `nodes`. It reuses the same
 * toolbar/drawer chrome but not DataGrid's OutlineNode column model.
 */
export function WishesGrid({
  initialWishes,
  initialNodes,
}: {
  initialWishes: WishListRow[];
  initialNodes: OutlineNode[];
}) {
  /** Optimistic patches on top of the server list — same idea as the node grids. */
  const [patches, setPatches] = useState<Record<string, Partial<WishListRow>>>({});
  const [scopeId, setScopeId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      initialWishes.map((row) =>
        patches[row.id] ? { ...row, ...patches[row.id] } : row,
      ),
    [initialWishes, patches],
  );

  const byNodeId = useMemo(() => {
    const map = new Map<string, OutlineNode>();
    for (const node of initialNodes) map.set(node.id, node);
    return map;
  }, [initialNodes]);

  const resultAreas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of initialWishes) {
      if (row.resultAreaId && row.resultAreaName) {
        seen.set(row.resultAreaId, row.resultAreaName);
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [initialWishes]);

  const visible = useMemo(() => {
    const filtered = scopeId
      ? rows.filter((row) => row.resultAreaId === scopeId)
      : rows;

    // Group by result area: emit header markers as synthetic rows.
    type Display =
      | { kind: "group"; id: string; label: string; count: number }
      | { kind: "wish"; row: WishListRow };

    const out: Display[] = [];
    let currentArea: string | null | undefined = undefined;
    let groupStart = 0;

    const flushCount = (end: number) => {
      if (out.length === 0) return;
      const header = out[groupStart];
      if (header?.kind === "group") {
        header.count = end - groupStart - 1;
      }
    };

    for (const row of filtered) {
      const areaKey = row.resultAreaId ?? "";
      if (areaKey !== currentArea) {
        flushCount(out.length);
        currentArea = areaKey;
        groupStart = out.length;
        out.push({
          kind: "group",
          id: `group:${areaKey}`,
          label: row.resultAreaName ?? "(No Result Area)",
          count: 0,
        });
      }
      out.push({ kind: "wish", row });
    }
    flushCount(out.length);
    return out;
  }, [rows, scopeId]);

  const patchRow = useCallback((id: string, changes: Partial<WishListRow>) => {
    setPatches((current) => ({
      ...current,
      [id]: { ...current[id], ...changes },
    }));
  }, []);

  const apply = useCallback(
    (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) setError(result.error);
        // Server props refresh on success; drop the optimistic layer either way.
        setPatches({});
      });
    },
    [],
  );

  const selectedWish = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;
  const detailNode = detailNodeId ? (byNodeId.get(detailNodeId) ?? null) : null;

  const openOwner = useCallback(() => {
    if (!selectedWish) return;
    setDetailNodeId(selectedWish.nodeId);
  }, [selectedWish]);

  // Stable, so the menu's listener effect does not re-register on every render.
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (detailNodeId) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Enter" && selectedWish) {
        event.preventDefault();
        setDetailNodeId(selectedWish.nodeId);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailNodeId, selectedWish]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
        <ToolbarSelect
          label="Result Area"
          value={scopeId}
          onChange={setScopeId}
          options={[{ value: "", label: "All Result Areas" }, ...resultAreas]}
        />
        <ToolbarButton onClick={openOwner} disabled={!selectedWish} title="Enter">
          Open owner
        </ToolbarButton>
      </TabToolbar>

      {error && <ErrorBanner message={error} />}

      <div
        className="grid flex-none items-center border-b border-rule-strong bg-surface-raised px-3 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
        style={{
          gridTemplateColumns: "3rem 4rem minmax(12rem,1fr) minmax(12rem,1.2fr)",
          columnGap: "0.75rem",
          height: "var(--row-height)",
        }}
      >
        <span className="text-center">Pri</span>
        <span>Type</span>
        <span>Title</span>
        <span>Description</span>
      </div>

      <div
        role="grid"
        aria-label="Wish List"
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No wishes yet. Add them on a Result Area&apos;s Wishes tab.
          </div>
        ) : (
          visible.map((entry) => {
            if (entry.kind === "group") {
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 border-b border-rule bg-surface-raised/80 px-3 text-[0.8125rem] font-semibold text-ink"
                  style={{ height: "var(--row-height)" }}
                >
                  <span className="truncate">{entry.label}</span>
                  <span className="tabular text-[0.75rem] font-normal text-ink-faint">
                    ({entry.count})
                  </span>
                </div>
              );
            }

            const row = entry.row;
            const selected = row.id === selectedId;
            return (
              <div
                key={row.id}
                role="row"
                aria-selected={selected}
                onClick={() => setSelectedId(row.id)}
                onDoubleClick={() => setDetailNodeId(row.nodeId)}
                onContextMenu={(event) => {
                  // Leave the browser's cut/copy/paste menu alone inside the editors.
                  if (
                    (event.target as HTMLElement).closest("input, select, textarea")
                  ) {
                    return;
                  }
                  event.preventDefault();
                  setSelectedId(row.id);
                  setMenu({ nodeId: row.nodeId, x: event.clientX, y: event.clientY });
                }}
                className={[
                  "grid items-center border-b border-rule/60 px-3 text-[0.875rem]",
                  selected ? "bg-select" : "hover:bg-surface-raised/60",
                ].join(" ")}
                style={{
                  gridTemplateColumns:
                    "3rem 4rem minmax(12rem,1fr) minmax(12rem,1.2fr)",
                  columnGap: "0.75rem",
                  height: "var(--row-height)",
                }}
              >
                <WishPriorityCell
                  letter={row.priorityLetter}
                  rank={row.priorityRank}
                  onChange={(letter, rank) => {
                    patchRow(row.id, {
                      priorityLetter: letter,
                      priorityRank: rank,
                    });
                    apply(() =>
                      updateNodeItemAction(row.id, {
                        priorityLetter: letter,
                        priorityRank: rank,
                      }),
                    );
                  }}
                />
                <span className="text-[0.75rem] font-medium text-ink-muted">
                  {WISH_TYPE_CODES[row.kind]}
                </span>
                <WishTextCell
                  value={row.title}
                  ariaLabel="Title"
                  onChange={(title) => {
                    patchRow(row.id, { title });
                    apply(() => updateNodeItemAction(row.id, { title }));
                  }}
                />
                <WishTextCell
                  value={row.description}
                  ariaLabel="Description"
                  onChange={(description) => {
                    patchRow(row.id, { description });
                    apply(() => updateNodeItemAction(row.id, { description }));
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {menu && (
        // One entry, because opening the owning result area is the only thing this tab
        // does to a wish that is not an inline cell edit.
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: "Open owner",
              shortcut: "Enter",
              onSelect: () => setDetailNodeId(menu.nodeId),
            },
          ]}
          onClose={closeMenu}
        />
      )}

      <NodeDetailDrawer node={detailNode} onClose={() => setDetailNodeId(null)} />
    </div>
  );
}

function WishPriorityCell({
  letter,
  rank,
  onChange,
}: {
  letter: PriorityLetter | null;
  rank: number | null;
  onChange: (letter: PriorityLetter | null, rank: number | null) => void;
}) {
  const current = formatPriority(letter, rank);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const parsed = parsePriority(value);
    if (!parsed) {
      setInvalid(true);
      setValue(current);
      return;
    }
    setInvalid(false);
    onChange(parsed.letter, parsed.rank);
  }

  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        setInvalid(false);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(current);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label="Priority"
      aria-invalid={invalid}
      placeholder="—"
      maxLength={3}
      className={[
        "tabular w-full border-none bg-transparent text-center text-[0.8125rem] font-medium uppercase outline-none placeholder:text-ink-faint/50",
        invalid ? "text-priority-a" : "text-ink-muted",
      ].join(" ")}
    />
  );
}

function WishTextCell({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  // Keyed on the stored value so a server refresh remounts with the new text.
  return (
    <WishTextCellInner
      key={value}
      value={value}
      ariaLabel={ariaLabel}
      onChange={onChange}
    />
  );
}

function WishTextCellInner({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      className="w-full truncate border-none bg-transparent text-[0.8125rem] text-ink outline-none"
    />
  );
}
