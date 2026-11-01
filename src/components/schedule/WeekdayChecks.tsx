import { WEEKDAY_LABELS } from "@/lib/schedule/geometry";

/** A checkbox per weekday, Sunday first; `onChange` gets the new set as sorted day numbers. */
export function WeekdayChecks({
  days,
  onChange,
}: {
  days: readonly number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAY_LABELS.map((label, d) => (
        <label
          key={label}
          className="flex items-center gap-1 text-[0.8125rem] font-normal normal-case tracking-normal text-ink"
        >
          <input
            type="checkbox"
            checked={days.includes(d)}
            onChange={() =>
              onChange(
                days.includes(d)
                  ? days.filter((x) => x !== d)
                  : [...days, d].sort((a, b) => a - b),
              )
            }
          />
          {label}
        </label>
      ))}
    </div>
  );
}
