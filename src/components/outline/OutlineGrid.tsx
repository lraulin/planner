"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import { defaultChildType, TYPE_LABELS } from "@/lib/tree/hierarchy";
import {
  createNodeAction,
  deleteNodeAction,
  indentNodeAction,
  moveNodeVerticallyAction,
  outdentNodeAction,
  renameNodeAction,
  setCollapsedAction,
  setDeadlineAction,
  setEffortAction,
  setFocusAction,
  setPriorityAction,
  setStateAction,
} from "@/app/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { DataGrid, buildAncestorPriorities } from "@/components/grid/DataGrid";
import { useOptimisticNodes } from "@/components/grid/useOptimisticNodes";
import { useToday } from "@/components/grid/useToday";
import { HintBar } from "./HintBar";
import { outlineColumns, type OutlineColumnCtx } from "./outlineColumns";

type TypeFilters = Record<NodeType, boolean>;

const ALL_TYPES_SHOWN: TypeFilters = {
  result_area: true,
  goal: true,
  project: true,
  task: true,
};

/**
 * Outline tab host: tree commands, type filters, drawer, and the shared DataGrid with the
 * outline's column set. Grouping is off — the outline is the tree itself.
 */
export function OutlineGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const { nodes, byId, patch, apply, error, setError } =
    useOptimisticNodes(initialNodes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialNodes[0]?.id ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OutlineNode | null>(null);
  const [filters, setFilters] = useState<TypeFilters>(ALL_TYPES_SHOWN);
  const [focusOnly, setFocusOnly] = useState(false);
  const today = useToday();

  const ancestorPriorities = useMemo(
    () => buildAncestorPriorities(nodes, byId),
    [nodes, byId],
  );

  const visible = useMemo(() => {
    const dropped = new Set<string>();
    return nodes.filter((node) => {
      const parentDropped = node.parentId ? dropped.has(node.parentId) : false;
      const filteredOut = !filters[node.type] || (focusOnly && !node.focus);
      if (parentDropped || filteredOut) {
        dropped.add(node.id);
        return false;
      }
      return !node.hidden;
    });
  }, [nodes, filters, focusOnly]);

  /** The outline is a flat list of node rows — no group headers, depth from the tree. */
  const gridRows: GridRow[] = useMemo(
    () =>
      visible.map((node) => ({
        kind: "node" as const,
        id: node.id,
        node,
        depth: node.depth,
        context: {
          resultAreaId: null,
          resultAreaName: null,
          resultAreaColor: null,
          category: null,
          goalId: null,
          goalName: null,
        },
      })),
    [visible],
  );

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const startNaming = useCallback((id?: string) => {
    if (!id) return;
    setSelectedId(id);
    setEditingId(id);
  }, []);

  const selectRelative = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((n) => n.id === selectedId);
      const next =
        index === -1 ? 0 : Math.min(Math.max(index + delta, 0), visible.length - 1);
      setSelectedId(visible[next].id);
    },
    [visible, selectedId],
  );

  const addSibling = useCallback(
    (where: "before" | "after") => {
      if (!selected) return;
      const parent = selected.parentId ? byId.get(selected.parentId) : null;
      apply(
        () =>
          createNodeAction({
            parentId: selected.parentId,
            type: defaultChildType(parent?.type ?? null),
            position: { at: where, siblingId: selected.id },
          }),
        startNaming,
      );
    },
    [selected, byId, apply, startNaming],
  );

  const addChild = useCallback(() => {
    if (!selected) return;
    apply(
      () =>
        createNodeAction({
          parentId: selected.id,
          type: defaultChildType(selected.type),
          position: { at: "last" },
        }),
      startNaming,
    );
  }, [selected, apply, startNaming]);

  const addResultArea = useCallback(() => {
    apply(
      () =>
        createNodeAction({
          parentId: null,
          type: "result_area",
          position: { at: "last" },
        }),
      startNaming,
    );
  }, [apply, startNaming]);

  const addGoal = useCallback(() => {
    if (!selected) return;
    const host =
      selected.type === "result_area" || selected.type === "goal"
        ? selected
        : nearestGoalHost(selected, byId);

    if (!host) {
      setError("Goals sit under a result area. Select one first.");
      return;
    }

    apply(
      () =>
        createNodeAction({
          parentId: host.id,
          type: "goal",
          position: { at: "last" },
        }),
      startNaming,
    );
  }, [selected, byId, apply, startNaming, setError]);

  const toggleCollapsed = useCallback(
    (node: OutlineNode, collapsed: boolean) => {
      if (!node.hasChildren) return;
      patch(node.id, { collapsed });
      apply(() => setCollapsedAction(node.id, collapsed));
    },
    [patch, apply],
  );

  const confirmDelete = useCallback(
    (node: OutlineNode) => {
      const index = visible.findIndex((n) => n.id === node.id);
      const nextSelection = visible[index + 1]?.id ?? visible[index - 1]?.id ?? null;
      setSelectedId(nextSelection);
      apply(() => deleteNodeAction(node.id));
    },
    [visible, apply],
  );

  const commands = useMemo(
    () => ({
      addSiblingAfter: () => addSibling("after"),
      addSiblingBefore: () => addSibling("before"),
      addChild,
      indent: () => selected && apply(() => indentNodeAction(selected.id)),
      outdent: () => selected && apply(() => outdentNodeAction(selected.id)),
      moveUp: () =>
        selected && apply(() => moveNodeVerticallyAction(selected.id, "up")),
      moveDown: () =>
        selected && apply(() => moveNodeVerticallyAction(selected.id, "down")),
      remove: () => selected && setPendingDelete(selected),
      rename: () => selected && setEditingId(selected.id),
      openDetail: () => selected && setDetailId(selected.id),
      collapse: () => selected && toggleCollapsed(selected, true),
      expand: () => selected && toggleCollapsed(selected, false),
      selectUp: () => selectRelative(-1),
      selectDown: () => selectRelative(1),
    }),
    [addSibling, addChild, selected, apply, toggleCollapsed, selectRelative],
  );

  const suspended = detailId !== null || pendingDelete !== null;
  useOutlineKeyboard({ commands, editingId, suspended });

  const columnCtx: OutlineColumnCtx = useMemo(
    () => ({
      today,
      selectedId,
      editingId,
      ancestorPriorities,
      onToggleCollapsed: (node) => toggleCollapsed(node, !node.collapsed),
      onOpenDetail: (node) => {
        setSelectedId(node.id);
        setDetailId(node.id);
      },
      onFinishEdit: (node, name) => {
        setEditingId(null);
        if (name !== node.name) {
          patch(node.id, { name });
          apply(() => renameNodeAction(node.id, name));
        }
      },
      onCancelEdit: () => setEditingId(null),
      onPriorityChange: (node, letter, rank) => {
        patch(node.id, { priorityLetter: letter, priorityRank: rank });
        apply(() => setPriorityAction(node.id, letter, rank));
      },
      onStateChange: (node, state) => {
        patch(node.id, { state });
        apply(() => setStateAction(node.id, state));
      },
      onFocusChange: (node, focus) => {
        patch(node.id, { focus });
        apply(() => setFocusAction(node.id, focus));
      },
      onDeadlineChange: (node, deadline) => {
        patch(node.id, { deadline: deadline ? new Date(deadline) : null });
        apply(() => setDeadlineAction(node.id, deadline));
      },
      onEffortChange: (node, minutes) => {
        patch(node.id, {
          effortMinutes: minutes,
          effortRollupMinutes: minutes,
        });
        apply(() => setEffortAction(node.id, minutes));
      },
    }),
    [today, selectedId, editingId, ancestorPriorities, toggleCollapsed, patch, apply],
  );

  const detailNode = detailId ? (byId.get(detailId) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <FilterBar
        filters={filters}
        onToggleType={(type) =>
          setFilters((current) => ({ ...current, [type]: !current[type] }))
        }
        focusOnly={focusOnly}
        onToggleFocusOnly={() => setFocusOnly((v) => !v)}
        commands={commands}
        onAddResultArea={addResultArea}
        onAddGoal={addGoal}
        hasSelection={selected !== null}
      />

      {error && (
        <p
          role="alert"
          className="flex-none border-b border-priority-a/40 bg-priority-a/10 px-4 py-1.5 text-[0.8125rem] text-priority-a"
        >
          {error}
        </p>
      )}

      <DataGrid
        rows={gridRows}
        columns={outlineColumns}
        columnCtx={columnCtx}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onOpenDetail={(id) => {
          setSelectedId(id);
          setDetailId(id);
        }}
        ariaLabel="Outline"
        empty={
          <EmptyState
            filtered={nodes.length > 0}
            onAddResultArea={addResultArea}
            onClearFilters={() => {
              setFilters(ALL_TYPES_SHOWN);
              setFocusOnly(false);
            }}
          />
        }
      />

      <HintBar />

      <NodeDetailDrawer node={detailNode} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete this ${pendingDelete ? TYPE_LABELS[pendingDelete.type].toLowerCase() : "row"}?`}
        message={deleteMessage(pendingDelete)}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) confirmDelete(target);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function nearestGoalHost(
  from: OutlineNode,
  byId: Map<string, OutlineNode>,
): OutlineNode | null {
  let current = from.parentId ? (byId.get(from.parentId) ?? null) : null;
  while (current) {
    if (current.type === "result_area" || current.type === "goal") return current;
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
  }
  return null;
}

function deleteMessage(node: OutlineNode | null): string {
  if (!node) return "";
  const label = node.name || `This ${TYPE_LABELS[node.type].toLowerCase()}`;
  return node.hasChildren
    ? `${label} and all ${node.childCount} items under it will be deleted. This cannot be undone.`
    : `${label} will be deleted. This cannot be undone.`;
}

/**
 * Keyboard control. Achieve's bindings, with Cmd+Return standing in for Insert — Apple
 * keyboards have no Insert key, but Insert still works for anyone with one.
 *
 * Bound to the document rather than the grid: the outline is the whole page, so arrows
 * and inserts should work immediately instead of requiring a click to focus the list
 * first. Anything typed into a field is left alone.
 */
function useOutlineKeyboard({
  commands,
  editingId,
  suspended,
}: {
  commands: Record<string, () => void>;
  editingId: string | null;
  suspended: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (editingId || suspended) return;

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

      const insert = event.key === "Insert" || (event.key === "Enter" && event.metaKey);

      if (insert) {
        event.preventDefault();
        if (event.ctrlKey) commands.addChild();
        else if (event.shiftKey) commands.addSiblingBefore();
        else commands.addSiblingAfter();
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          if (event.altKey) commands.moveUp();
          else commands.selectUp();
          break;
        case "ArrowDown":
          event.preventDefault();
          if (event.altKey) commands.moveDown();
          else commands.selectDown();
          break;
        case "ArrowLeft":
          event.preventDefault();
          commands.collapse();
          break;
        case "ArrowRight":
          event.preventDefault();
          commands.expand();
          break;
        case "Tab":
          event.preventDefault();
          if (event.shiftKey) commands.outdent();
          else commands.indent();
          break;
        case "Enter":
          event.preventDefault();
          commands.openDetail();
          break;
        case "F2":
          event.preventDefault();
          commands.rename();
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          commands.remove();
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commands, editingId, suspended]);
}

function FilterBar({
  filters,
  onToggleType,
  focusOnly,
  onToggleFocusOnly,
  commands,
  onAddResultArea,
  onAddGoal,
  hasSelection,
}: {
  filters: TypeFilters;
  onToggleType: (type: NodeType) => void;
  focusOnly: boolean;
  onToggleFocusOnly: () => void;
  commands: Record<string, () => void>;
  onAddResultArea: () => void;
  onAddGoal: () => void;
  hasSelection: boolean;
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
      <div className="flex items-center gap-1">
        <Command onClick={onAddResultArea}>New result area</Command>
        <Command onClick={onAddGoal} disabled={!hasSelection}>
          New goal
        </Command>
        <Command onClick={commands.addSiblingAfter} disabled={!hasSelection}>
          Add sibling
        </Command>
        <Command onClick={commands.addChild} disabled={!hasSelection}>
          Add child
        </Command>
      </div>

      <span className="h-4 w-px bg-rule" aria-hidden />

      <div className="flex items-center gap-1">
        <Command onClick={commands.openDetail} disabled={!hasSelection} title="Enter">
          Open
        </Command>
        <Command onClick={commands.rename} disabled={!hasSelection} title="F2">
          Rename
        </Command>
      </div>

      <span className="h-4 w-px bg-rule" aria-hidden />

      <div className="flex items-center gap-1">
        <Command onClick={commands.outdent} disabled={!hasSelection} title="Shift+Tab">
          ←
        </Command>
        <Command onClick={commands.indent} disabled={!hasSelection} title="Tab">
          →
        </Command>
        <Command onClick={commands.moveUp} disabled={!hasSelection} title="Alt+Up">
          ↑
        </Command>
        <Command onClick={commands.moveDown} disabled={!hasSelection} title="Alt+Down">
          ↓
        </Command>
        <Command onClick={commands.remove} disabled={!hasSelection} title="Delete">
          Delete
        </Command>
      </div>

      <div className="ml-auto flex items-center gap-3 text-[0.8125rem] text-ink-muted">
        {(Object.keys(TYPE_LABELS) as NodeType[]).map((type) => (
          <Toggle
            key={type}
            checked={filters[type]}
            onChange={() => onToggleType(type)}
            label={`${TYPE_LABELS[type]}s`}
          />
        ))}
        <Toggle checked={focusOnly} onChange={onToggleFocusOnly} label="Focus only" />
      </div>
    </div>
  );
}

function Command({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
      {label}
    </label>
  );
}

function EmptyState({
  filtered,
  onAddResultArea,
  onClearFilters,
}: {
  filtered: boolean;
  onAddResultArea: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {filtered ? (
        <>
          <p className="text-[0.9375rem] text-ink-muted">
            Every row is hidden by the current filters.
          </p>
          <Command onClick={onClearFilters}>Show everything</Command>
        </>
      ) : (
        <>
          <p className="max-w-sm text-[0.9375rem] text-ink-muted">
            Result areas are the major dimensions of your life — the roles the rest of
            the outline hangs from. Start with one.
          </p>
          <Command onClick={onAddResultArea}>New result area</Command>
        </>
      )}
    </div>
  );
}
