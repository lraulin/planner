"use client";

import { useState } from "react";
import type { NodeItem, NodeItemKind } from "@/db/schema";
import { toDateKey } from "@/lib/schedule/geometry";
import { formatPriority } from "@/lib/tree/format";
import type { NodeItemValues } from "@/lib/detail/types";
import { normalizeHttpUrl } from "@/lib/url/pageTitle";
import {
  CheckboxField,
  DateField,
  DraftTextArea,
  DraftTextField,
  FieldGrid,
  NumberField,
  PriorityField,
  SelectField,
} from "./fields";
import {
  columnLabel,
  ITEM_KINDS,
  type ItemColumnKey,
  type ItemField,
} from "./itemKinds";

/**
 * One repeating list inside a detail form — objectives, risks, stakeholders, and the other
 * eleven. What it shows and what its editor offers both come from `itemKinds.ts`, so this
 * component is the only list renderer in the app.
 *
 * Achieve edits one of these rows by opening a modal on top of the modal already holding the
 * form. We expand the row in place instead: `ux-principles.md` calls stacked modals the part
 * of Achieve's design worth leaving behind.
 *
 * Keyboard follows the outline's conventions, since the two sit inches apart: `Insert` (or
 * `Cmd+Enter`) adds a row, `Enter` opens the selected one, `Delete` removes it.
 */
export function ItemList({
  kind,
  items,
  onCreate,
  onChange,
  onDelete,
  onMove,
  busy,
}: {
  kind: NodeItemKind;
  items: NodeItem[];
  onCreate: () => void;
  onChange: (itemId: string, values: NodeItemValues) => void;
  onDelete: (item: NodeItem) => void;
  onMove: (itemId: string, direction: "up" | "down") => void;
  busy: boolean;
}) {
  const config = ITEM_KINDS[kind];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink">
          {config.title}
        </h3>
        <span className="tabular text-[0.75rem] text-ink-faint">{items.length}</span>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="ml-auto rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:opacity-40"
        >
          Add {config.singular}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-faint">
          {config.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-rule">
          <div
            className="flex items-center gap-3 border-b border-rule bg-surface-raised px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
            aria-hidden
          >
            {config.columns.map((column) => (
              <span key={column} className={columnClass(column)}>
                {columnLabel(config, column)}
              </span>
            ))}
            {/* Spacer matching the row-controls column. */}
            <span className="w-24 flex-none md:w-16" />
          </div>

          <ul>
            {items.map((item, index) => (
              <li key={item.id} className="border-b border-rule/60 last:border-b-0">
                <div
                  className="flex items-center gap-3 px-3 py-1.5 text-[0.8125rem] hover:bg-surface-raised/60"
                  onDoubleClick={() => setOpenId(openId === item.id ? null : item.id)}
                  // Single tap expands too, matching "tap opens the record" everywhere else.
                  // The ▼ button below is still the discoverable affordance; this just makes
                  // the whole row a target rather than a 32px glyph at the far right.
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button, a, input"))
                      return;
                    setOpenId(openId === item.id ? null : item.id);
                  }}
                >
                  {config.columns.map((column) => (
                    <span
                      key={column}
                      className={`${columnClass(column)} truncate ${
                        column === "priority" ? "tabular" : ""
                      } ${
                        column === "url"
                          ? ""
                          : summaryOf(item, column)
                            ? "text-ink"
                            : "text-ink-faint"
                      }`}
                    >
                      {column === "url" ? (
                        <UrlCell value={summaryOf(item, column)} />
                      ) : (
                        summaryOf(item, column) || "—"
                      )}
                    </span>
                  ))}

                  <span className="flex flex-none justify-end gap-0.5 md:w-16">
                    <RowButton
                      label="Move up"
                      onClick={() => onMove(item.id, "up")}
                      disabled={busy || index === 0}
                    >
                      ↑
                    </RowButton>
                    <RowButton
                      label="Move down"
                      onClick={() => onMove(item.id, "down")}
                      disabled={busy || index === items.length - 1}
                    >
                      ↓
                    </RowButton>
                    <RowButton
                      label={openId === item.id ? "Collapse" : "Edit"}
                      onClick={() => setOpenId(openId === item.id ? null : item.id)}
                      expanded={openId === item.id}
                    >
                      {openId === item.id ? "▲" : "▼"}
                    </RowButton>
                  </span>
                </div>

                {openId === item.id && (
                  <div className="border-t border-rule bg-surface-raised/40 px-3 py-3">
                    <ItemEditor
                      item={item}
                      fields={config.fields}
                      onChange={(values) => onChange(item.id, values)}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        disabled={busy}
                        className="rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-priority-a transition-colors hover:border-priority-a hover:bg-priority-a/10 disabled:opacity-40"
                      >
                        Delete {config.singular}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Priority and the numeric columns are narrow; everything else shares what's left. */
function columnClass(column: ItemColumnKey): string {
  switch (column) {
    case "priority":
      return "w-8 flex-none text-center";
    case "severity":
    case "probability":
    case "score":
      return "w-12 flex-none text-right";
    case "entryDate":
      return "tabular w-24 flex-none";
    case "filled":
    case "resolved":
    case "completed":
    case "received":
    case "awarded":
    case "active":
      return "w-14 flex-none";
    default:
      return "min-w-0 flex-1";
  }
}

function summaryOf(item: NodeItem, column: ItemColumnKey): string {
  if (column === "priority") {
    return formatPriority(item.priorityLetter, item.priorityRank);
  }

  const value = item[column];
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return toDateKey(value);
  return String(value);
}

/** Attachment URL column: clickable when it is a real http(s) link. */
function UrlCell({ value }: { value: string }) {
  if (!value) return <span className="text-ink-faint">—</span>;

  const href = normalizeHttpUrl(value);
  if (!href) {
    return <span className="text-ink">{value}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className="block truncate text-[var(--select-edge)] underline-offset-2 hover:underline"
    >
      {value}
    </a>
  );
}

function RowButton({
  children,
  label,
  onClick,
  disabled,
  expanded,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      // 20px is right beside a mouse and unhittable with a thumb. Height is what a list row
      // gives away cheapest, so the touch target grows vertically and stays narrow.
      className="flex h-tap w-8 items-center justify-center rounded text-[0.75rem] text-ink-faint transition-colors hover:bg-surface-raised hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent md:h-5 md:w-5 md:text-[0.625rem]"
    >
      {children}
    </button>
  );
}

/** The expanded row: every field the kind declares, in the order it declares them. */
function ItemEditor({
  item,
  fields,
  onChange,
}: {
  item: NodeItem;
  fields: ItemField[];
  onChange: (values: NodeItemValues) => void;
}) {
  return (
    <FieldGrid>
      {fields.map((field) => {
        // Prose gets the full width; everything else pairs up.
        const wide = field.kind === "textarea" ? "sm:col-span-2" : "";

        switch (field.kind) {
          case "priority":
            return (
              <PriorityField
                key={field.key}
                label={field.label}
                letter={item.priorityLetter}
                rank={item.priorityRank}
                onChange={(priorityLetter, priorityRank) =>
                  onChange({ priorityLetter, priorityRank })
                }
              />
            );

          case "textarea":
            return (
              <DraftTextArea
                key={field.key}
                label={field.label}
                rows={field.rows ?? 3}
                value={stringValue(item, field.key)}
                onCommit={(value) => onChange({ [field.key]: value })}
                className={wide}
              />
            );

          case "number":
            return (
              <NumberField
                key={field.key}
                label={field.label}
                min={field.min}
                max={field.max}
                value={numberValue(item, field.key)}
                onChange={(value) => onChange({ [field.key]: value })}
              />
            );

          case "date":
            return (
              <DateField
                key={field.key}
                label={field.label}
                value={dateValue(item, field.key)}
                onChange={(value) => onChange({ [field.key]: value })}
              />
            );

          case "select":
            return (
              <SelectField
                key={field.key}
                label={field.label}
                allowEmpty
                value={stringValue(item, field.key) || null}
                options={(field.options ?? []).map((option) => ({
                  value: option,
                  label: option,
                }))}
                onChange={(value) => onChange({ [field.key]: value })}
              />
            );

          case "check":
            return (
              <CheckboxField
                key={field.key}
                label={field.label}
                checked={Boolean(item[field.key as keyof NodeItem])}
                onChange={(value) => onChange({ [field.key]: value })}
                className="self-end pb-2"
              />
            );

          default:
            return (
              <DraftTextField
                key={field.key}
                label={field.label}
                value={stringValue(item, field.key)}
                onCommit={(value) => onChange({ [field.key]: value })}
              />
            );
        }
      })}
    </FieldGrid>
  );
}

function stringValue(item: NodeItem, key: ItemColumnKey): string {
  if (key === "priority") return formatPriority(item.priorityLetter, item.priorityRank);
  const value = item[key];
  return typeof value === "string" ? value : "";
}

function numberValue(item: NodeItem, key: ItemColumnKey): number | null {
  if (key === "priority") return item.priorityRank;
  const value = item[key];
  return typeof value === "number" ? value : null;
}

function dateValue(item: NodeItem, key: ItemColumnKey): Date | null {
  if (key === "priority") return null;
  const value = item[key];
  return value instanceof Date ? value : null;
}
