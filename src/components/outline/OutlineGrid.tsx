"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { NodeType, PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { defaultChildType, STATE_LABELS, TYPE_LABELS } from "@/lib/tree/hierarchy";
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
  type ActionResult,
} from "@/app/outline/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { OutlineRow } from "./OutlineRow";
import { HintBar } from "./HintBar";

type TypeFilters = Record<NodeType, boolean>;

const ALL_TYPES_SHOWN: TypeFilters = {
  result_area: true,
  goal: true,
  project: true,
  task: true,
};

export function OutlineGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const [patches, setPatches] = useState<Record<string, Partial<OutlineNode>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(
    initialNodes[0]?.id ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OutlineNode | null>(null);
  const [filters, setFilters] = useState<TypeFilters>(ALL_TYPES_SHOWN);
  const [focusOnly, setFocusOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);
  const today = useToday();

  // The server is the source of truth. Optimistic edits are layered on top of it during
  // render, so there is no local copy of the tree to keep in sync.
  const nodes = useMemo(
    () => initialNodes.map((n) => (patches[n.id] ? { ...n, ...patches[n.id] } : n)),
    [initialNodes, patches],
  );

  const byId = useMemo(() => {
    const map = new Map<string, OutlineNode>();
    for (const node of nodes) map.set(node.id, node);
    return map;
  }, [nodes]);

  /**
   * The chain of ancestor priorities for each node, which the spine renders as one rail
   * per level — the tree's shape and its priority distribution in a single visual.
   */
  const ancestorPriorities = useMemo(() => {
    const chains = new Map<string, (PriorityLetter | null)[]>();
    for (const node of nodes) {
      const chain: (PriorityLetter | null)[] = [];
      let current = node.parentId;
      while (current) {
        const parent = byId.get(current);
        if (!parent) break;
        chain.unshift(parent.priorityLetter);
        current = parent.parentId;
      }
      chains.set(node.id, chain);
    }
    return chains;
  }, [nodes, byId]);

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

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const apply = useCallback(
    (action: () => Promise<ActionResult>, onSuccess?: (id?: string) => void) => {
      setError(null);
      startTransition(async () => {
        const result = await action();
        if (result.ok) onSuccess?.(result.id);
        else setError(result.error);
        // The server's answer is authoritative either way, so drop the optimistic layer:
        // an accepted change is already reflected, and a rejected one visibly reverts.
        setPatches({});
      });
    },
    [],
  );

  /** A new row is selected and open for typing, so inserting flows straight into naming. */
  const startNaming = useCallback((id?: string) => {
    if (!id) return;
    setSelectedId(id);
    setEditingId(id);
  }, []);

  /** Applies a change locally first so typing and toggling feel immediate. */
  const patch = useCallback((nodeId: string, changes: Partial<OutlineNode>) => {
    setPatches((current) => ({
      ...current,
      [nodeId]: { ...current[nodeId], ...changes },
    }));
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

  /**
   * Goals need their own command: `defaultChildType` sends a result area's children
   * straight to Project, which is the common case but leaves the Goal level with no way in.
   */
  const addGoal = useCallback(() => {
    if (!selected) return;
    // A goal may sit under a result area or another goal. Anywhere deeper, add it beside
    // the nearest ancestor that can hold one rather than refusing.
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
  }, [selected, byId, apply, startNaming]);

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
      // Move the selection somewhere sensible before the row disappears.
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

  // A dialog or the drawer owns the keyboard while it is open; the outline behind it must
  // not also act on arrows and Delete.
  const suspended = detailId !== null || pendingDelete !== null;

  useOutlineKeyboard({ commands, editingId, suspended });

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

      <ColumnHeader />

      <div
        ref={gridRef}
        tabIndex={0}
        role="tree"
        aria-label="Outline"
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {visible.length === 0 ? (
          <EmptyState
            filtered={nodes.length > 0}
            onAddResultArea={addResultArea}
            onClearFilters={() => {
              setFilters(ALL_TYPES_SHOWN);
              setFocusOnly(false);
            }}
          />
        ) : (
          visible.map((node) => (
            <OutlineRow
              key={node.id}
              node={node}
              ancestorPriorities={ancestorPriorities.get(node.id) ?? []}
              selected={node.id === selectedId}
              editing={node.id === editingId}
              today={today}
              stateLabel={STATE_LABELS[node.state]}
              onSelect={() => setSelectedId(node.id)}
              onOpenDetail={() => {
                setSelectedId(node.id);
                setDetailId(node.id);
              }}
              onFinishEdit={(name) => {
                setEditingId(null);
                if (name !== node.name) {
                  patch(node.id, { name });
                  apply(() => renameNodeAction(node.id, name));
                }
              }}
              onCancelEdit={() => setEditingId(null)}
              onToggleCollapsed={() => toggleCollapsed(node, !node.collapsed)}
              onPriorityChange={(letter, rank) => {
                patch(node.id, { priorityLetter: letter, priorityRank: rank });
                apply(() => setPriorityAction(node.id, letter, rank));
              }}
              onStateChange={(state) => {
                patch(node.id, { state });
                apply(() => setStateAction(node.id, state));
              }}
              onFocusChange={(focus) => {
                patch(node.id, { focus });
                apply(() => setFocusAction(node.id, focus));
              }}
              onDeadlineChange={(deadline) => {
                patch(node.id, { deadline: deadline ? new Date(deadline) : null });
                apply(() => setDeadlineAction(node.id, deadline));
              }}
              onEffortChange={(minutes) => {
                // Only leaf tasks are editable, so the row's own estimate and its rollup
                // are the same number. Ancestor totals catch up when the server responds.
                patch(node.id, {
                  effortMinutes: minutes,
                  effortRollupMinutes: minutes,
                });
                apply(() => setEffortAction(node.id, minutes));
              }}
            />
          ))
        )}
      </div>

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

/** The closest ancestor a goal may legally hang from, or null if there is none. */
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
  /** True while a drawer or dialog is open above the grid. */
  suspended: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // While a cell is being edited, the field owns the keyboard.
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
        // Achieve opens the record on Enter and renames on F2, the Windows convention.
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

/** Column widths are shared with OutlineRow through the grid template in both files. */
export const GRID_TEMPLATE =
  "grid-cols-[minmax(16rem,1fr)_3rem_4.5rem_7rem_7rem_3rem] gap-x-3";

function ColumnHeader() {
  return (
    <div
      className={`grid flex-none ${GRID_TEMPLATE} items-center border-b border-rule-strong bg-surface-raised px-3 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted`}
      style={{ height: "var(--row-height)" }}
    >
      <span>Name</span>
      <span className="text-center">Pri</span>
      <span className="text-right">Effort</span>
      <span className="text-right">Deadline</span>
      <span>State</span>
      <span className="text-center">Focus</span>
    </div>
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

/**
 * Today's date, as YYYY-MM-DD, or null on the server.
 *
 * "Overdue" depends on the reader's clock, which the server does not have. Reading it
 * through an external store keeps the server and first client render agreeing on null,
 * so nothing flashes the wrong colour during hydration.
 */
function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new Date().toISOString().slice(0, 10),
    () => null,
  );
}
