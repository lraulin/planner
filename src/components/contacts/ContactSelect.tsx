"use client";

import { useId } from "react";
import { TypeaheadSelect } from "@/components/detail/TypeaheadSelect";
import { matchContacts, resolveContactQuery } from "@/lib/contacts/match";
import type { ContactOption } from "@/lib/contacts/types";

/** How many matches the open list will paint. The rest stay behind the filter. */
const LIST_LIMIT = 50;

/**
 * Type-to-filter address-book picker. Replaces a `<select>` once the list is long
 * enough that scrolling it is slower than typing a name.
 *
 * A typed name that does not resolve uniquely reverts — creating a person still goes
 * through `/contacts`. Escape closes the list without closing the drawer (window-capture,
 * before Drawer's document-capture listener), same as the exercise picker.
 *
 * Pass `label` when the picker is the field (the Contacts-tab editor). Callers that already
 * wrap their own label omit it so the control stays a bare input.
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
  const inputId = id ?? (label ? generatedId : undefined);

  const input = (
    <TypeaheadSelect
      items={contacts}
      value={value}
      onChange={onChange}
      labelOf={(contact) => contact.displayName}
      match={matchContacts}
      resolve={resolveContactQuery}
      emptyLabel={emptyLabel}
      id={inputId}
      disabled={disabled}
      limit={LIST_LIMIT}
    />
  );

  if (!label) return input;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      >
        {label}
      </label>
      {input}
    </div>
  );
}
