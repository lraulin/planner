"use client";

import {
  useId,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { fieldNameOf, type ColumnMeta } from "./columns";

const FIELD_MIME = "application/x-planner-show-field";

type FieldSide = "available" | "shown";

type DragPayload = {
  id: string;
  from: FieldSide;
};

/**
 * Achieve's Show Fields chooser: available fields on the left, shown-in-order on the
 * right, with Move Up/Down and Reset.
 *
 * **Click selects** a field so Move Up / Move Down / Show / Hide know which row to act on.
 * **Double-click** (or Enter) moves it between the lists. **Drag** reorders the shown list
 * and can also move a field between Available and Shown.
 *
 * Layout is a modal because it is a short-lived configuration step (same class as a
 * confirm), not a record editor.
 *
 * **Reset Fields** restores only the column set / order / widths. **Reset this grid**
 * (optional) forgets filters, sort, group collapse and the column layout together — the
 * whole `grid:{tabId}` scope.
 */
export function ShowFieldsDialog({
  open,
  allColumns,
  shownIds,
  onShow,
  onHide,
  onMove,
  onPlace,
  onReset,
  onResetGrid,
  onClose,
}: {
  open: boolean;
  allColumns: ColumnMeta[];
  shownIds: string[];
  onShow: (id: string, atIndex?: number) => void;
  onHide: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  /** Drag reorder: land `id` at `toIndex` in the shown list (0 = first). */
  onPlace: (id: string, toIndex: number) => void;
  /** Column layout only — the view's preset order and default widths. */
  onReset: () => void;
  /** Whole grid scope: columns, filters, sort, collapsed groups. */
  onResetGrid?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const byId = new Map(allColumns.map((column) => [column.id, column]));
  const available = allColumns.filter((column) => !shownIds.includes(column.id));
  const shown = shownIds
    .map((id) => byId.get(id))
    .filter((column): column is ColumnMeta => column !== undefined);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<FieldSide>("shown");
  /** Drop marker index inside the shown list (0…shown.length). */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** Which list is the current drag target — used for available-list highlight. */
  const [dropSide, setDropSide] = useState<FieldSide | null>(null);

  // If the pick left its list (shown/hidden), treat it as no selection — derived so we
  // never fight React with setState-in-effect when the order prop changes.
  const effectiveSelectedId =
    selectedId &&
    (selectedSide === "shown"
      ? shownIds.includes(selectedId)
      : available.some((column) => column.id === selectedId))
      ? selectedId
      : null;

  const selectedShownIndex = effectiveSelectedId
    ? shownIds.indexOf(effectiveSelectedId)
    : -1;
  const selectedColumn = effectiveSelectedId
    ? (byId.get(effectiveSelectedId) ?? null)
    : null;

  const canShowSelected =
    selectedSide === "available" &&
    effectiveSelectedId !== null &&
    selectedColumn !== null;
  const canHideSelected =
    selectedSide === "shown" &&
    effectiveSelectedId !== null &&
    selectedColumn !== null &&
    selectedColumn.hideable !== false &&
    shown.length > 1;
  const canMoveUp = selectedSide === "shown" && selectedShownIndex > 0;
  const canMoveDown =
    selectedSide === "shown" &&
    selectedShownIndex >= 0 &&
    selectedShownIndex < shownIds.length - 1;

  function select(side: FieldSide, id: string) {
    setSelectedSide(side);
    setSelectedId(id);
  }

  function activate(side: FieldSide, id: string) {
    if (side === "available") {
      onShow(id);
      setSelectedSide("shown");
      setSelectedId(id);
      return;
    }
    const column = byId.get(id);
    if (!column || column.hideable === false || shown.length <= 1) return;
    onHide(id);
    setSelectedSide("available");
    setSelectedId(id);
  }

  function parseDrag(event: ReactDragEvent): DragPayload | null {
    const raw =
      event.dataTransfer.getData(FIELD_MIME) ||
      event.dataTransfer.getData("text/plain");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DragPayload;
      if (
        parsed &&
        typeof parsed.id === "string" &&
        (parsed.from === "available" || parsed.from === "shown")
      ) {
        return parsed;
      }
    } catch {
      // Fall through — treat bare id as from unknown side.
    }
    if (byId.has(raw)) {
      return {
        id: raw,
        from: shownIds.includes(raw) ? "shown" : "available",
      };
    }
    return null;
  }

  function onDragStart(side: FieldSide, id: string, event: ReactDragEvent) {
    const payload: DragPayload = { id, from: side };
    event.dataTransfer.setData(FIELD_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
    select(side, id);
  }

  function clearDragState() {
    setDraggingId(null);
    setDropIndex(null);
    setDropSide(null);
  }

  function indexFromPointer(
    listEl: HTMLElement,
    clientY: number,
    count: number,
  ): number {
    const items = Array.from(listEl.querySelectorAll<HTMLElement>("[data-field-id]"));
    if (items.length === 0) return 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) return i;
    }
    return count;
  }

  function onShownDragOver(event: ReactDragEvent<HTMLUListElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropSide("shown");
    setDropIndex(indexFromPointer(event.currentTarget, event.clientY, shown.length));
  }

  function onAvailableDragOver(event: ReactDragEvent<HTMLUListElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropSide("available");
    setDropIndex(null);
  }

  function onShownDrop(event: ReactDragEvent<HTMLUListElement>) {
    event.preventDefault();
    const payload = parseDrag(event);
    const index =
      dropIndex ?? indexFromPointer(event.currentTarget, event.clientY, shown.length);
    clearDragState();
    if (!payload || !byId.has(payload.id)) return;

    if (payload.from === "shown") {
      onPlace(payload.id, index);
    } else {
      onShow(payload.id, index);
    }
    setSelectedSide("shown");
    setSelectedId(payload.id);
  }

  function onAvailableDrop(event: ReactDragEvent<HTMLUListElement>) {
    event.preventDefault();
    const payload = parseDrag(event);
    clearDragState();
    if (!payload || payload.from !== "shown") return;
    const column = byId.get(payload.id);
    if (!column || column.hideable === false || shown.length <= 1) return;
    onHide(payload.id);
    setSelectedSide("available");
    setSelectedId(payload.id);
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            Show Fields
          </h2>
          <p className="text-[0.75rem] text-ink-muted">
            Click to select, double-click to show or hide, drag to reorder or move
            between lists.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldList
            title="Available fields"
            side="available"
            columns={available}
            empty="Every field is shown."
            selectedId={selectedSide === "available" ? effectiveSelectedId : null}
            draggingId={draggingId}
            dropActive={dropSide === "available"}
            dropIndex={null}
            onSelect={(id) => select("available", id)}
            onActivate={(id) => activate("available", id)}
            onDragStart={(id, event) => onDragStart("available", id, event)}
            onDragEnd={clearDragState}
            onDragOver={onAvailableDragOver}
            onDragLeave={() => {
              if (dropSide === "available") setDropSide(null);
            }}
            onDrop={onAvailableDrop}
          />
          <FieldList
            title="Show these fields in this order"
            side="shown"
            columns={shown}
            empty="Add a field from the left."
            selectedId={selectedSide === "shown" ? effectiveSelectedId : null}
            draggingId={draggingId}
            dropActive={dropSide === "shown"}
            dropIndex={dropSide === "shown" ? dropIndex : null}
            onSelect={(id) => select("shown", id)}
            onActivate={(id) => activate("shown", id)}
            onDragStart={(id, event) => onDragStart("shown", id, event)}
            onDragEnd={clearDragState}
            onDragOver={onShownDragOver}
            onDragLeave={() => {
              if (dropSide === "shown") {
                setDropSide(null);
                setDropIndex(null);
              }
            }}
            onDrop={onShownDrop}
            canActivate={(column) => column.hideable !== false && shown.length > 1}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canShowSelected}
            onClick={() =>
              effectiveSelectedId && activate("available", effectiveSelectedId)
            }
            className={buttonClass}
            title="Add the selected available field"
          >
            Show →
          </button>
          <button
            type="button"
            disabled={!canHideSelected}
            onClick={() =>
              effectiveSelectedId && activate("shown", effectiveSelectedId)
            }
            className={buttonClass}
            title="Hide the selected shown field"
          >
            ← Hide
          </button>
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => effectiveSelectedId && onMove(effectiveSelectedId, "up")}
            className={buttonClass}
            title="Move the selected field earlier in the order"
          >
            Move Up
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => effectiveSelectedId && onMove(effectiveSelectedId, "down")}
            className={buttonClass}
            title="Move the selected field later in the order"
          >
            Move Down
          </button>
          <button type="button" onClick={onReset} className={buttonClass}>
            Reset Fields
          </button>
          {onResetGrid && (
            <button
              type="button"
              onClick={onResetGrid}
              title="Clear filters, sort, column layout and collapsed groups for this view"
              className={buttonClass}
            >
              Reset this grid
            </button>
          )}
          <button type="button" onClick={onClose} className={`${buttonClass} ml-auto`}>
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const buttonClass =
  "rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40";

function FieldList({
  title,
  side,
  columns,
  empty,
  selectedId,
  draggingId,
  dropActive,
  dropIndex,
  onSelect,
  onActivate,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  canActivate,
}: {
  title: string;
  side: FieldSide;
  columns: ColumnMeta[];
  empty: string;
  selectedId: string | null;
  draggingId: string | null;
  dropActive: boolean;
  dropIndex: number | null;
  onSelect: (id: string) => void;
  onActivate: (id: string) => void;
  onDragStart: (id: string, event: ReactDragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLUListElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: ReactDragEvent<HTMLUListElement>) => void;
  canActivate?: (column: ColumnMeta) => boolean;
}) {
  function onKeyDown(column: ColumnMeta, event: ReactKeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (canActivate && !canActivate(column)) return;
      onActivate(column.id);
    }
  }

  return (
    <div
      className={[
        "flex min-h-48 flex-col rounded border border-rule",
        dropActive ? "border-select-edge bg-select/20" : "",
      ].join(" ")}
    >
      <div className="border-b border-rule bg-surface-raised px-2 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {title}
      </div>
      <ul
        className="min-h-0 flex-1 overflow-auto p-1"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {columns.length === 0 ? (
          <li className="px-2 py-3 text-[0.8125rem] text-ink-faint">{empty}</li>
        ) : (
          columns.map((column, index) => {
            const selected = column.id === selectedId;
            const dragging = column.id === draggingId;
            const locked = canActivate ? !canActivate(column) : false;
            return (
              <li key={column.id} className="relative">
                {dropIndex === index && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 rounded bg-select-edge"
                  />
                )}
                <button
                  type="button"
                  data-field-id={column.id}
                  draggable
                  onClick={() => onSelect(column.id)}
                  onDoubleClick={() => {
                    if (locked) return;
                    onActivate(column.id);
                  }}
                  onKeyDown={(event) => onKeyDown(column, event)}
                  onDragStart={(event) => onDragStart(column.id, event)}
                  onDragEnd={onDragEnd}
                  className={[
                    "flex w-full cursor-grab items-center gap-2 rounded px-2 py-1 text-left text-[0.8125rem] active:cursor-grabbing",
                    selected
                      ? "bg-select text-ink"
                      : "text-ink hover:bg-surface-raised",
                    dragging ? "opacity-50" : "",
                    locked && side === "shown" ? "opacity-80" : "",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="flex-none text-[0.6875rem] leading-none text-ink-faint"
                  >
                    ⋮⋮
                  </span>
                  <span className="min-w-0 flex-1 truncate">{fieldNameOf(column)}</span>
                  {locked && side === "shown" && (
                    <span className="flex-none text-[0.6875rem] text-ink-faint">
                      required
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
        {dropIndex === columns.length && columns.length > 0 && (
          <li className="relative h-1">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 rounded bg-select-edge"
            />
          </li>
        )}
      </ul>
    </div>
  );
}
