"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import {
  customFilter,
  defaultFilterOperand,
  describeCustom,
  operatorNeedsOperand,
  operatorsForKind,
  type FilterKind,
  type CustomColumnFilter,
  type FilterCondition,
  type FilterJoin,
  type FilterOperator,
} from "@/lib/grid/customFilter";

/**
 * Achieve's "Enter filter criteria for {Column}" dialog. Draft is local until OK so a
 * half-built expression never re-filters the grid mid-edit — same pattern as
 * `NoteFilterDialog`.
 */
export function CustomFilterDialog({
  open,
  columnLabel,
  kind,
  filter,
  distinctValues,
  onApply,
  onClose,
}: {
  open: boolean;
  columnLabel: string;
  kind: FilterKind | undefined;
  /** Existing custom filter, or null to start a fresh one-condition draft. */
  filter: CustomColumnFilter | null;
  distinctValues: string[];
  onApply: (filter: CustomColumnFilter) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <CustomFilterDialogBody
      columnLabel={columnLabel}
      kind={kind}
      filter={filter}
      distinctValues={distinctValues}
      onApply={onApply}
      onClose={onClose}
    />
  );
}

function CustomFilterDialogBody({
  columnLabel,
  kind,
  filter,
  distinctValues,
  onApply,
  onClose,
}: {
  columnLabel: string;
  kind: FilterKind | undefined;
  filter: CustomColumnFilter | null;
  distinctValues: string[];
  onApply: (filter: CustomColumnFilter) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const operators = operatorsForKind(kind);
  const defaultOp = operators[0]?.id ?? "eq";
  const defaultOperand = defaultFilterOperand(kind);

  const [draft, setDraft] = useState<CustomColumnFilter>(() =>
    filter && filter.conditions.length > 0
      ? {
          mode: "custom",
          join: filter.join,
          conditions: filter.conditions.map((c) => ({ ...c })),
        }
      : customFilter("and", [{ op: defaultOp, value: defaultOperand }]),
  );

  const setJoin = (join: FilterJoin) => setDraft((current) => ({ ...current, join }));

  const updateCondition = (index: number, patch: Partial<FilterCondition>) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addCondition = () => {
    setDraft((current) => ({
      ...current,
      conditions: [...current.conditions, { op: defaultOp, value: defaultOperand }],
    }));
  };

  const deleteCondition = (index: number) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((_, i) => i !== index),
    }));
  };

  const preview = describeCustom(
    columnLabel,
    draft,
    kind === "number" ? (value) => (value.trim() === "" ? "0" : value) : undefined,
  );
  const useValueSelect = kind === "enum" && distinctValues.length > 0;
  const useDateInput = kind === "date";

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-xl">
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Enter filter criteria for {columnLabel}
        </h2>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <input
              type="radio"
              name="filter-join"
              checked={draft.join === "and"}
              onChange={() => setJoin("and")}
              className="accent-[var(--select-edge)]"
            />
            And conditions
          </label>
          <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <input
              type="radio"
              name="filter-join"
              checked={draft.join === "or"}
              onChange={() => setJoin("or")}
              className="accent-[var(--select-edge)]"
            />
            Or conditions
          </label>
        </div>

        <div className="overflow-hidden rounded border border-rule">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-0 border-b border-rule bg-surface-raised text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            <div className="px-3 py-1.5">Operator</div>
            <div className="px-3 py-1.5">Operand</div>
            <div className="w-10" />
          </div>
          {draft.conditions.length === 0 ? (
            <p className="px-3 py-4 text-[0.8125rem] text-ink-faint">
              No conditions — the column will show everything.
            </p>
          ) : (
            draft.conditions.map((condition, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-0 border-b border-rule last:border-b-0"
              >
                <div className="px-2 py-1.5">
                  <select
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
                        value={condition.value}
                        onChange={(event) =>
                          updateCondition(index, { value: event.target.value })
                        }
                        className={INPUT_CLASS}
                      >
                        <option value="">(pick a value)</option>
                        {distinctValues.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={useDateInput ? "date" : "text"}
                        inputMode={kind === "number" ? "decimal" : undefined}
                        value={condition.value}
                        onChange={(event) =>
                          updateCondition(index, { value: event.target.value })
                        }
                        placeholder={
                          kind === "priority"
                            ? "A1"
                            : kind === "date"
                              ? "YYYY-MM-DD"
                              : kind === "number"
                                ? "0.00"
                                : "value"
                        }
                        className={INPUT_CLASS}
                      />
                    )
                  ) : (
                    <span className="px-1 text-[0.8125rem] text-ink-faint">—</span>
                  )}
                </div>
                <div className="px-1">
                  <button
                    type="button"
                    onClick={() => deleteCondition(index)}
                    title="Delete condition"
                    className="rounded px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addCondition} className={BUTTON_CLASS}>
            Add a condition
          </button>
          <button
            type="button"
            onClick={() => deleteCondition(draft.conditions.length - 1)}
            disabled={draft.conditions.length === 0}
            className={BUTTON_CLASS}
          >
            Delete condition
          </button>
        </div>

        <p className="min-h-[1.25rem] font-mono text-[0.75rem] text-ink-muted">
          {preview || "—"}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="rounded border border-select-edge bg-select px-3 py-1 text-[0.8125rem] leading-none font-medium text-ink transition-colors hover:brightness-95"
          >
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-select-edge";

const BUTTON_CLASS =
  "rounded border border-rule px-2 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40";
