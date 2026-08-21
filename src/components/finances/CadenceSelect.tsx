"use client";

import { useState } from "react";
import {
  CADENCE_CHOICES,
  cadenceFromKey,
  cadenceKey,
  cadenceLabel,
  type Cadence,
} from "@/lib/finances/recurringBills";

/** The sentinel option that swaps the control into its day-count field. */
const CUSTOM = "custom";

/**
 * How often a bill charges — the shared control, because four surfaces ask the same question.
 *
 * The list covers the cadences bills actually use, in both units. Anything else goes through
 * **Every N days…**, which swaps the select for a number field rather than opening a dialog:
 * a modal to enter one integer would be the heaviest possible answer, and this control has to
 * fit inside a grid row.
 *
 * A cadence already stored outside the list — a bill on 45 days — is added to the options so
 * the select can render the value it was given. A `<select>` whose value matches no option
 * silently shows the first one, which would be a UI that lies about the data.
 */
export function CadenceSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  value: Cadence;
  onChange: (cadence: Cadence) => void;
  disabled?: boolean;
  ariaLabel: string;
  className: string;
}) {
  const [days, setDays] = useState<string | null>(null);

  if (days !== null) {
    return (
      <input
        type="number"
        min={2}
        max={200}
        step={1}
        value={days}
        autoFocus
        disabled={disabled}
        aria-label={`${ariaLabel} in days`}
        onChange={(event) => setDays(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDays(null);
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          const n = Math.round(Number(days));
          setDays(null);
          if (Number.isFinite(n) && n >= 2 && n <= 200) onChange({ unit: "day", n });
        }}
        className={className}
      />
    );
  }

  const known = CADENCE_CHOICES.some(
    (choice) => cadenceKey(choice) === cadenceKey(value),
  );

  return (
    <select
      value={cadenceKey(value)}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        if (event.target.value === CUSTOM) {
          setDays(String(value.unit === "day" ? value.n : 30));
          return;
        }
        const next = cadenceFromKey(event.target.value);
        if (next !== null) onChange(next);
      }}
      className={className}
    >
      {!known && <option value={cadenceKey(value)}>{cadenceLabel(value)}</option>}
      {CADENCE_CHOICES.map((choice) => (
        <option key={cadenceKey(choice)} value={cadenceKey(choice)}>
          {cadenceLabel(choice)}
        </option>
      ))}
      <option value={CUSTOM}>Every N days…</option>
    </select>
  );
}
