"use client";

import { useState } from "react";
import type { ContactItemKind } from "@/db/schema";
import type { ContactItemView } from "@/lib/contacts/types";
import {
  CONTACT_ITEM_KINDS,
  summarizeContactItem,
  type ContactItemField,
} from "@/lib/contacts/itemKinds";
import {
  ComboboxField,
  DraftTextArea,
  DraftTextField,
  FieldGrid,
} from "@/components/detail/fields";

/**
 * One repeating list on a contact — phone numbers, e-mail, addresses or web URLs.
 *
 * A sibling of `src/components/detail/ItemList.tsx` rather than a generalization of it.
 * That one is 524 lines typed against `NodeItem`; parameterizing it over a row type would
 * touch every detail form in the app, and half of what it does is wrong here anyway (CSV
 * import/export per list, a priority column, sort-cycling headers). What it does have that
 * is right — expand in place instead of a modal over a modal, ↑/↓ to reorder, a
 * config-driven editor, commit on blur — is borrowed.
 *
 * What it has no concept of is the one control contacts genuinely need: **primary** is a
 * within-list single selection, not a per-row boolean, which is why it is a radio group.
 */
export function ContactItemList({
  kind,
  items,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onMove,
  onSetPrimary,
}: {
  kind: ContactItemKind;
  items: ContactItemView[];
  busy?: boolean;
  onCreate: () => void;
  onUpdate: (itemId: string, field: ContactItemField, value: string) => void;
  onDelete: (itemId: string) => void;
  onMove: (itemId: string, direction: "up" | "down") => void;
  onSetPrimary: (itemId: string) => void;
}) {
  const config = CONTACT_ITEM_KINDS[kind];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.8125rem] font-semibold text-ink">{config.title}</h3>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="min-h-tap rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink hover:border-rule-strong hover:bg-surface-raised disabled:opacity-40 md:min-h-0"
        >
          Add {config.singular}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-rule px-3 py-3 text-[0.8125rem] text-ink-faint">
          {config.empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule rounded border border-rule">
          {items.map((item, index) => {
            const expanded = expandedId === item.id;
            const summary = summarizeContactItem(kind, item);

            return (
              <li key={item.id} className="flex flex-col">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {config.hasPrimary && (
                    <input
                      type="radio"
                      // One radio group per kind, so picking a primary phone cannot
                      // deselect the primary e-mail.
                      name={`primary-${kind}-${item.contactId}`}
                      checked={item.isPrimary}
                      onChange={() => onSetPrimary(item.id)}
                      disabled={busy}
                      aria-label={`Make this the primary ${config.singular}`}
                      title="Primary"
                      className="flex-none accent-accent"
                    />
                  )}

                  <span className="w-16 flex-none truncate text-[0.75rem] text-ink-muted">
                    {item.label}
                  </span>

                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : item.id)}
                    aria-expanded={expanded}
                    className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-ink hover:underline"
                  >
                    {summary || (
                      <span className="text-ink-faint">Empty — click to fill in</span>
                    )}
                  </button>

                  {item.notes && (
                    <span
                      aria-label="Has notes"
                      title={item.notes}
                      className="flex-none text-[0.75rem] text-ink-faint"
                    >
                      ✎
                    </span>
                  )}

                  <div className="flex flex-none items-center gap-0.5">
                    <IconButton
                      label="Move up"
                      disabled={busy || index === 0}
                      onClick={() => onMove(item.id, "up")}
                    >
                      ↑
                    </IconButton>
                    <IconButton
                      label="Move down"
                      disabled={busy || index === items.length - 1}
                      onClick={() => onMove(item.id, "down")}
                    >
                      ↓
                    </IconButton>
                  </div>
                </div>

                {expanded && (
                  <div className="flex flex-col gap-3 border-t border-rule bg-surface-raised/40 px-3 py-3">
                    <FieldGrid columns={2}>
                      {config.fields.map((field) => {
                        const value = item[field.key];
                        const full = field.span === "full" || field.kind === "textarea";

                        return (
                          <div
                            key={field.key}
                            className={full ? "sm:col-span-2" : undefined}
                          >
                            {field.kind === "textarea" ? (
                              <DraftTextArea
                                label={field.label}
                                value={value}
                                rows={2}
                                onCommit={(next) => onUpdate(item.id, field.key, next)}
                              />
                            ) : field.options ? (
                              // A combobox, not a select: People accepts custom types and
                              // returns them verbatim, so the list is a suggestion.
                              <ComboboxField
                                label={field.label}
                                value={value}
                                options={field.options}
                                placeholder={field.placeholder}
                                onChange={(next) => onUpdate(item.id, field.key, next)}
                              />
                            ) : (
                              <DraftTextField
                                label={field.label}
                                value={value}
                                placeholder={field.placeholder}
                                onCommit={(next) => onUpdate(item.id, field.key, next)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </FieldGrid>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedId(null);
                          onDelete(item.id);
                        }}
                        disabled={busy}
                        className="min-h-tap rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-priority-a hover:border-priority-a disabled:opacity-40 md:min-h-0"
                      >
                        Remove {config.singular}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="min-h-tap flex w-6 items-center justify-center rounded text-[0.75rem] text-ink-faint hover:bg-surface-raised hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent md:min-h-0 md:h-6"
    >
      {children}
    </button>
  );
}
