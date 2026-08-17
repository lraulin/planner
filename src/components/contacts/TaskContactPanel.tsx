"use client";

import { useEffect, useState, useTransition } from "react";
import { listContactOptionsAction } from "@/app/library/contacts/actions";
import type { ContactOption } from "@/lib/contacts/types";
import { FieldGrid, Section } from "@/components/detail/fields";
import { ContactSelect } from "./ContactSelect";

/**
 * The task-side of a contact discussion item.
 *
 * The Contact drawer creates this link implicitly when it makes a Discussion Item. This
 * picker keeps the relationship editable from the ordinary Task drawer too — a task does
 * not become second-class merely because it started somewhere else.
 */
export function TaskContactPanel({
  contactId,
  onChange,
}: {
  contactId: string | null | undefined;
  onChange: (contactId: string | null) => void;
}) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await listContactOptionsAction();
      if (!cancelled && result.ok) setContacts(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section title="Contact">
      <FieldGrid>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <ContactSelect
            value={contactId ?? null}
            onChange={onChange}
            contacts={contacts}
            disabled={loading}
          />
          <span className="text-[0.75rem] font-normal normal-case tracking-normal text-ink-faint">
            Links this task to a person&apos;s discussion list. Completing it resolves
            that item there too.
          </span>
        </div>
      </FieldGrid>
    </Section>
  );
}
