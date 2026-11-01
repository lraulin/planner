import { relativeDaysLabel } from "@/lib/dateFormat";

/**
 * A signed day count — days left until a due date, negative once it has passed. Past days
 * fade, today stands out, and the hover says what the number means.
 */
export function DaysLeftCell({ days, textSize }: { days: number; textSize: string }) {
  return (
    <span
      title={relativeDaysLabel(days)}
      className={`tabular block text-right ${textSize} ${
        days < 0 ? "text-ink-faint" : days === 0 ? "text-ink" : "text-ink-muted"
      }`}
    >
      {days}
    </span>
  );
}
