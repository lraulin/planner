import {
  isCalendarDayKind,
  operatorNeedsOperand,
  operatorsForKind,
  type FilterCondition,
  type FilterKind,
} from "@/lib/grid/customFilter";

const INPUT_CLASS =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-select-edge md:min-h-0";

function placeholderFor(kind: FilterKind | undefined): string {
  if (kind === "priority") return "A1";
  if (isCalendarDayKind(kind)) return "YYYY-MM-DD";
  if (kind === "number") return "0.00";
  return "value";
}

/**
 * One condition of a filter expression, as the three cells of its table row: the operator,
 * the operand — a pick-list for an enum with known values, a date or text box otherwise,
 * nothing for blank / nonblank — and the delete button. Shared by the per-column custom
 * filter and the grid's advanced filter, which adds its own column cell in front.
 */
export function FilterConditionCells({
  condition,
  kind,
  values,
  onChange,
  onDelete,
}: {
  condition: FilterCondition;
  kind: FilterKind | undefined;
  /** The column's distinct values, offered as a pick-list for an enum column. */
  values: readonly string[];
  onChange: (patch: Partial<FilterCondition>) => void;
  onDelete: () => void;
}) {
  const operators = operatorsForKind(kind);
  const useValueSelect = kind === "enum" && values.length > 0;

  return (
    <>
      <div className="px-2 py-1.5">
        <select
          aria-label="Operator"
          value={condition.op}
          onChange={(event) => {
            const chosen = operators.find((op) => op.id === event.target.value);
            if (chosen) onChange({ op: chosen.id });
          }}
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
        {!operatorNeedsOperand(condition.op) ? (
          <span className="px-1 text-[0.8125rem] text-ink-faint">—</span>
        ) : useValueSelect ? (
          <select
            aria-label="Operand"
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
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
            type={isCalendarDayKind(kind) ? "date" : "text"}
            inputMode={kind === "number" ? "decimal" : undefined}
            value={condition.value}
            onChange={(event) => onChange({ value: event.target.value })}
            placeholder={placeholderFor(kind)}
            className={INPUT_CLASS}
          />
        )}
      </div>

      <div className="px-1 py-1.5">
        <button
          type="button"
          onClick={onDelete}
          title="Delete condition"
          aria-label="Delete condition"
          className="min-h-tap rounded px-2 py-1 text-[0.8125rem] text-ink-muted hover:bg-surface-raised hover:text-ink md:min-h-0"
        >
          ×
        </button>
      </div>
    </>
  );
}
