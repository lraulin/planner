"use client";

import {
  groupEnvelopeOptions,
  parseNewEnvelopeKind,
  type EnvelopePickerOption,
} from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";

/**
 * Category picker grouped the way the Budget page is, with New {type}… in each section.
 * Sentinel values never become the stored Category — they open a create flow instead.
 */
export function CategorySelect({
  envelopes,
  value,
  onChange,
  onCreate,
  disabled = false,
  ariaLabel,
  className,
}: {
  envelopes: readonly EnvelopePickerOption[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onCreate: (kind: EnvelopeKind) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const grouped = groupEnvelopeOptions(envelopes);
  return (
    <select
      value={value ?? ""}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        const kind = parseNewEnvelopeKind(next);
        if (kind) {
          onCreate(kind);
          return;
        }
        onChange(next === "" ? null : next);
      }}
      className={className}
    >
      <option value="">Categorize</option>
      {grouped.map(({ section, envelopes: rows }) => (
        <optgroup key={section.kind} label={section.label}>
          {rows.map((envelope) => (
            <option key={envelope.id} value={envelope.id}>
              {envelope.label}
            </option>
          ))}
          <option value={section.createValue}>{section.createLabel}</option>
        </optgroup>
      ))}
    </select>
  );
}
