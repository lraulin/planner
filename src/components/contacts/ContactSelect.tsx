"use client";

import { useId } from "react";
import type { ContactOption } from "@/lib/contacts/types";

const SELECT_CLASS =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge disabled:opacity-50 md:min-h-0";

/**
 * One address-book picker. Resources, the Task discussion-item field, and the Project/Task
 * Contacts tab all point at the same `ContactOption[]` from `loadContactOptions`.
 *
 * Pass `label` when the picker is the field (the Contacts-tab editor). Callers that already
 * wrap their own label omit it so the control stays a bare select.
 */
export function ContactSelect({
  value,
  onChange,
  contacts,
  disabled,
  id,
  label,
  emptyLabel = "(none)",
}: {
  value: string | null;
  onChange: (contactId: string | null) => void;
  contacts: readonly ContactOption[];
  disabled?: boolean;
  id?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? (label ? generatedId : undefined);
  const select = (
    <select
      id={selectId}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
      disabled={disabled}
      className={SELECT_CLASS}
    >
      <option value="">{emptyLabel}</option>
      {contacts.map((contact) => (
        <option key={contact.id} value={contact.id}>
          {contact.displayName}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={selectId}
        className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      >
        {label}
      </label>
      {select}
    </div>
  );
}
