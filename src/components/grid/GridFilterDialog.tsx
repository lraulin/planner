"use client";

import { useId, useMemo, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import {
  operatorNeedsOperand,
  operatorsForKind,
  type FilterJoin,
  type FilterOperator,
} from "@/lib/grid/customFilter";
import {
  describeCrossFilter,
  EMPTY_CROSS_FILTER,
  type CrossColumnFilter,
  type CrossCondition,
} from "@/lib/grid/crossFilter";
import { fieldNameOf, type ColumnMeta } from "./columns";

/**
 * The grid's advanced filter: one And/Or expression whose conditions may each name a
 * different column — including columns Show Fields is currently hiding, which is the whole
 * point. Hiding a column is a layout choice; it should not silently un-ask a question.
 *
 * Sits one level above `CustomFilterDialog`, which builds an expression *within* one column
 * from its header funnel. Both are kept: progressive disclosure means the cheap path stays
 * cheap, and most narrowing is still a single click on a funnel.
 *
 * The draft is local until OK, so a half-built expression never re-filters the grid
 * mid-edit — the same rule as `CustomFilterDialog` and `NoteFilterDialog`.
 */
export function GridFilterDialog({
  open,
  gridLabel,
  columns,
  visibleIds,
  distinctValues,
  filter,
  onApply,
  onClose,
}: {
  open: boolean;
  /** Names the grid being filtered, e.g. "Tasks". */
  gridLabel: string;
  /** Every column the tab defines. Ones without a `filterValue` are not offered. */
  columns: ColumnMeta[];
  /** Column ids currently on screen, so the rest can be marked as hidden. */
  visibleIds: readonly string[];
  /** Distinct values per column id, for enum operand pickers. */
  distinctValues: Record<string, string[]>;
  filter: CrossColumnFilter | null;
  onApply: (filter: CrossColumnFilter | null) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <GridFilterDialogBody
      gridLabel={gridLabel}
      columns={columns}
      visibleIds={visibleIds}
      distinctValues={distinctValues}
      filter={filter}
      onApply={onApply}
      onClose={onClose}
    />
  );
}

function GridFilterDialogBody({
  gridLabel,
  columns,
  visibleIds,
  distinctValues,
  filter,
  onApply,
  onClose,
}: {
  gridLabel: string;
  columns: ColumnMeta[];
  visibleIds: readonly string[];
  distinctValues: Record<string, string[]>;
  filter: CrossColumnFilter | null;
  onApply: (filter: CrossColumnFilter | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const joinName = useId();

  const filterable = useMemo(
    () => columns.filter((column) => Boolean(column.filterValue)),
    [columns],
  );
  const byId = useMemo(
    () => new Map(filterable.map((column) => [column.id, column])),
    [filterable],
  );
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);

  const firstColumnId = filterable[0]?.id ?? "";

  const [draft, setDraft] = useState<CrossColumnFilter>(() =>
    filter && filter.conditions.length > 0
      ? { join: filter.join, conditions: filter.conditions.map((c) => ({ ...c })) }
      : {
          ...EMPTY_CROSS_FILTER,
          conditions: firstColumnId
            ? [
                {
                  columnId: firstColumnId,
                  op: defaultOpFor(byId, firstColumnId),
                  value: "",
                },
              ]
            : [],
        },
  );

  const setJoin = (join: FilterJoin) => setDraft((current) => ({ ...current, join }));

  const updateCondition = (index: number, patch: Partial<CrossCondition>) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  /**
   * Changing the column can strand the operator — "contains" is legal on text and not on a
   * date. Snap to that kind's first operator instead of applying an illegal one, and drop
   * the operand, which was written for a different kind of value.
   */
  const changeColumn = (index: number, columnId: string) => {
    const current = draft.conditions[index];
    const nextOps = operatorsForKind(byId.get(columnId)?.filterKind);
    const keepsOp = nextOps.some((op) => op.id === current.op);
    updateCondition(index, {
      columnId,
      op: keepsOp ? current.op : (nextOps[0]?.id ?? "eq"),
      value: keepsOp ? current.value : "",
    });
  };

  const addCondition = () => {
    if (!firstColumnId) return;
    setDraft((current) => ({
      ...current,
      conditions: [
        ...current.conditions,
        {
          columnId: firstColumnId,
          op: defaultOpFor(byId, firstColumnId),
          value: "",
        },
      ],
    }));
  };

  const deleteCondition = (index: number) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((_, i) => i !== index),
    }));
  };

  const preview = describeCrossFilter(draft, (id) => {
    const column = byId.get(id);
    return column ? fieldNameOf(column) : id;
  });

  const hiddenInUse = draft.conditions.some(
    (condition) => byId.has(condition.columnId) && !visible.has(condition.columnId),
  );

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-2xl">
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Filter — {gridLabel}
        </h2>

        <div className="flex items-center gap-4 text-[0.8125rem] text-ink-muted">
          <span>Match</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={joinName}
              checked={draft.join === "and"}
              onChange={() => setJoin("and")}
              className="accent-[var(--select-edge)]"
            />
            all
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name={joinName}
              checked={draft.join === "or"}
              onChange={() => setJoin("or")}
              className="accent-[var(--select-edge)]"
            />
            any
          </label>
          <span>of the following:</span>
        </div>

        <div className="overflow-hidden rounded border border-rule">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] border-b border-rule bg-surface-raised text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            <div className="px-3 py-1.5">Column</div>
            <div className="px-3 py-1.5">Operator</div>
            <div className="px-3 py-1.5">Operand</div>
            <div className="w-10" />
          </div>

          {draft.conditions.length === 0 ? (
            <p className="px-3 py-4 text-[0.8125rem] text-ink-faint">
              No conditions — the grid will show everything.
            </p>
          ) : (
            draft.conditions.map((condition, index) => {
              const column = byId.get(condition.columnId);
              const operators = operatorsForKind(column?.filterKind);
              const hidden = column !== undefined && !visible.has(condition.columnId);
              const values = distinctValues[condition.columnId] ?? [];
              const useValueSelect = column?.filterKind === "enum" && values.length > 0;

              return (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] items-start border-b border-rule last:border-b-0"
                >
                  <div className="px-2 py-1.5">
                    <select
                      aria-label="Column"
                      value={condition.columnId}
                      onChange={(event) => changeColumn(index, event.target.value)}
                      className={INPUT_CLASS}
                    >
                      {!column && (
                        // A stored condition whose column is gone. Keep it selectable so the
                        // user can see and remove it rather than having it vanish silently.
                        <option value={condition.columnId}>
                          {condition.columnId} (no longer available)
                        </option>
                      )}
                      {filterable.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {fieldNameOf(entry)}
                          {visible.has(entry.id) ? "" : " · hidden"}
                        </option>
                      ))}
                    </select>
                    {hidden && (
                      <p className="px-0.5 pt-1 text-[0.6875rem] leading-tight text-ink-faint">
                        column is hidden — filters anyway
                      </p>
                    )}
                  </div>

                  <div className="px-2 py-1.5">
                    <select
                      aria-label="Operator"
                      value={condition.op}
                      onChange={(event) =>
                        updateCondition(index, {
                          op: event.target.value as FilterOperator,
                        })
                      }
                      className={INPUT_CLASS}
                    >
                      {operators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.symbol} {op.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="px-2 py-1.5">
                    {operatorNeedsOperand(condition.op) ? (
                      useValueSelect ? (
                        <select
                          aria-label="Operand"
                          value={condition.value}
                          onChange={(event) =>
                            updateCondition(index, { value: event.target.value })
                          }
                          className={INPUT_CLASS}
                        >
                          <option value="">(pick a value)</option>
                          {values.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label="Operand"
                          type={column?.filterKind === "date" ? "date" : "text"}
                          value={condition.value}
                          onChange={(event) =>
                            updateCondition(index, { value: event.target.value })
                          }
                          placeholder={placeholderFor(column?.filterKind)}
                          className={INPUT_CLASS}
                        />
                      )
                    ) : (
                      <span className="px-1 text-[0.8125rem] text-ink-faint">—</span>
                    )}
                  </div>

                  <div className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => deleteCondition(index)}
                      title="Delete condition"
                      aria-label="Delete condition"
                      className="min-h-tap rounded px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink md:min-h-0"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addCondition}
            disabled={!firstColumnId}
            className={BUTTON_CLASS}
          >
            + Add condition
          </button>
          {hiddenInUse && (
            <span className="text-[0.75rem] text-ink-faint">
              Filtering on a column this view is not showing.
            </span>
          )}
        </div>

        <p className="min-h-[1.25rem] font-mono text-[0.75rem] break-words text-ink-muted">
          {preview || "—"}
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setDraft({ join: draft.join, conditions: [] })}
            disabled={draft.conditions.length === 0}
            className={BUTTON_CLASS}
          >
            Clear all
          </button>
          <button type="button" onClick={onClose} className={BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              // An empty draft clears the filter rather than storing a vacuous expression.
              onApply(draft.conditions.length > 0 ? draft : null);
              onClose();
            }}
            className="min-h-tap rounded border border-select-edge bg-select px-3 py-1 text-[0.8125rem] leading-none font-medium text-ink transition-colors hover:brightness-95 md:min-h-0"
          >
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function defaultOpFor(byId: Map<string, ColumnMeta>, columnId: string): FilterOperator {
  return operatorsForKind(byId.get(columnId)?.filterKind)[0]?.id ?? "eq";
}

function placeholderFor(kind: ColumnMeta["filterKind"]): string {
  if (kind === "priority") return "A1";
  if (kind === "date") return "YYYY-MM-DD";
  return "value";
}

const INPUT_CLASS =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-select-edge md:min-h-0";

const BUTTON_CLASS =
  "min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0";
