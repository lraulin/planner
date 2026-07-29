"use client";

import { useEffect, useId, useRef } from "react";
import { useModalFocus } from "@/components/detail/focus";
import type { ColumnMeta } from "./columns";

/**
 * Achieve's Show Fields chooser: available fields on the left, shown-in-order on the
 * right, with Move Up/Down and Reset. Layout is a modal because it is a short-lived
 * configuration step (same class as a confirm), not a record editor.
 */
export function ShowFieldsDialog({
  open,
  allColumns,
  shownIds,
  onShow,
  onHide,
  onMove,
  onReset,
  onClose,
}: {
  open: boolean;
  allColumns: ColumnMeta[];
  shownIds: string[];
  onShow: (id: string) => void;
  onHide: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const byId = new Map(allColumns.map((column) => [column.id, column]));
  const available = allColumns.filter((column) => !shownIds.includes(column.id));
  const shown = shownIds.map((id) => byId.get(id)).filter(Boolean) as ColumnMeta[];

  useModalFocus(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onClose}
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-lg border border-rule-strong bg-surface p-5 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Show Fields
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <FieldList
            title="Available fields"
            columns={available}
            empty="Every field is shown."
            onActivate={onShow}
            actionLabel="Show"
          />
          <FieldList
            title="Show these fields in this order"
            columns={shown}
            empty="Add a field from the left."
            onActivate={onHide}
            actionLabel="Hide"
            canHide={(column) => column.hideable !== false && shown.length > 1}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const last = shownIds[shownIds.length - 1];
              if (last) onMove(last, "up");
            }}
            className={buttonClass}
          >
            Move Up
          </button>
          <button
            type="button"
            onClick={() => {
              const last = shownIds[shownIds.length - 1];
              if (last) onMove(last, "down");
            }}
            className={buttonClass}
          >
            Move Down
          </button>
          <button type="button" onClick={onReset} className={buttonClass}>
            Reset Fields
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass} ml-auto`}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const buttonClass =
  "rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised";

function FieldList({
  title,
  columns,
  empty,
  onActivate,
  actionLabel,
  canHide,
}: {
  title: string;
  columns: ColumnMeta[];
  empty: string;
  onActivate: (id: string) => void;
  actionLabel: string;
  canHide?: (column: ColumnMeta) => boolean;
}) {
  return (
    <div className="flex min-h-48 flex-col rounded border border-rule">
      <div className="border-b border-rule bg-surface-raised px-2 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {title}
      </div>
      <ul className="min-h-0 flex-1 overflow-auto p-1">
        {columns.length === 0 ? (
          <li className="px-2 py-3 text-[0.8125rem] text-ink-faint">{empty}</li>
        ) : (
          columns.map((column) => {
            const disabled = canHide ? !canHide(column) : false;
            return (
              <li key={column.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onActivate(column.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[0.8125rem] text-ink hover:bg-select disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{column.label}</span>
                  <span className="text-[0.6875rem] text-ink-faint">{actionLabel}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
