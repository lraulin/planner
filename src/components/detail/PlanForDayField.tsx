"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { planNodeForDayAction } from "@/app/day/actions";

/**
 * "Plan for day" — put this task on a day's list in the Day tab, from the task itself.
 *
 * This is the interoperability seam. The Day tab is not a separate task system bolted on
 * beside the outline: a task can be planned from the day page, dragged there from the week
 * grid, or set here on the record, and all three write the same `daily_items` row.
 *
 * Two ways it deliberately differs from the date fields above it:
 *
 * - **It is not a deadline.** Nothing planned for a day can go overdue. Missing it just
 *   means the row carries forward to the next day you open.
 * - **It saves immediately** rather than on drawer save, because it does not live on the
 *   task record at all — deciding when to do something is a separate act from editing what
 *   the thing is.
 */
export function PlanForDayField({
  nodeId,
  plannedDay,
}: {
  nodeId: string;
  plannedDay: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [value, setValue] = useState(plannedDay ?? "");
  const [error, setError] = useState<string | null>(null);

  async function commit(next: string) {
    setError(null);
    const result = await planNodeForDayAction(nodeId, next || null);
    if (!result.ok) {
      setError(result.error);
      setValue(plannedDay ?? "");
      return;
    }
    router.refresh();
  }

  /**
   * Typing a date fires `change` on every segment, and a half-typed date reads as `""` —
   * writing that straight through would delete the plan once per keystroke on the way to
   * setting it. So a complete date commits immediately (which is also what picking from the
   * calendar widget produces), while an empty value only commits on blur, where it
   * unambiguously means "clear this".
   */
  function onChange(next: string) {
    setValue(next);
    if (next !== "") void commit(next);
  }

  function onBlur() {
    if (value === "" && plannedDay !== null) void commit("");
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[0.75rem] text-ink-muted">
        Plan for day
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="tabular w-full rounded border border-rule bg-surface px-2 py-1 text-[0.8125rem] text-ink outline-none focus:border-rule-strong"
      />
      <p className="text-[0.6875rem] text-ink-faint">
        {error ?? "Shows on that day's list. Not a deadline — it carries forward."}
      </p>
    </div>
  );
}
