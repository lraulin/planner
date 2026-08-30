"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
} from "react";
import { listContactOptionsAction } from "@/app/library/contacts/actions";
import { ContactSelect } from "@/components/contacts/ContactSelect";
import type { NodeItem, NodeItemKind } from "@/db/schema";
import type { ContactOption } from "@/lib/contacts/types";
import { downloadTextFile } from "@/components/grid/downloadCsv";
import { itemsToCsv, parseItemsCsv, resolveContactCsvRows } from "@/lib/detail/itemCsv";
import { exportFilename, stampExportBody } from "@/lib/grid/exportCsv";
import {
  cycleItemSort,
  defaultItemSort,
  sortItems,
  type ItemSort,
} from "@/lib/detail/itemSort";
import type { NodeItemValues } from "@/lib/detail/types";
import { toDateKey } from "@/lib/schedule/geometry";
import { formatPriority } from "@/lib/tree/format";
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
} from "@/lib/detail/itemKinds";

/**
 * One repeating list inside a detail form — objectives, risks, stakeholders, and the other
 * eleven. What it shows and what its editor offers both come from `itemKinds.ts`, so this
 * component is the only list renderer in the app.
 *
 * Achieve edits one of these rows by opening a modal on top of the modal already holding the
 * form. We expand the row in place instead: `ux-principles.md` calls stacked modals the part
 * of Achieve's design worth leaving behind.
 *
 * Lists with a Pri column open sorted by priority (Achieve's default). Every summary header
 * is clickable and cycles unsorted → asc → desc → unsorted like the main grids. Sorting is
 * display-only; ↑/↓ still rewrite stored `sortKey` order and only work when sort is cleared.
 *
 * CSV export/import uses the kind's full editor fields so a round-trip keeps descriptions
 * and extras, not only the summary columns. Import appends; export follows the on-screen
 * order (including the active sort).
 *
 * Keyboard follows the outline's conventions, since the two sit inches apart: `⌘⏎` adds a row,
 * `⏎` opens the selected one, `⌫` removes it.
 */
export function ItemList({
  kind,
  items,
  onCreate,
  onChange,
  onDelete,
  onMove,
  onImport,
  onFetchTitle,
  busy,
}: {
  kind: NodeItemKind;
  items: NodeItem[];
  onCreate: () => void;
  onChange: (
    itemId: string,
    values: NodeItemValues,
  ) => void | Promise<{ ok: true; warning?: string } | { ok: false; error: string }>;
  onDelete: (item: NodeItem) => void;
  onMove: (itemId: string, direction: "up" | "down") => void;
  onImport: (
    rows: NodeItemValues[],
  ) => Promise<{ ok: true; created: number } | { ok: false; error: string }>;
  onFetchTitle?: (
    itemId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  busy: boolean;
}) {
  const config = ITEM_KINDS[kind];
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<ItemSort | null>(() =>
    defaultItemSort(config.columns),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const seenIds = useRef(new Set(items.map((item) => item.id)));

  const contactNames = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact.displayName])),
    [contacts],
  );

  useEffect(() => {
    if (kind !== "contact") return;
    let cancelled = false;
    void listContactOptionsAction().then((result) => {
      if (!cancelled && result.ok) setContacts(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "contact") {
      seenIds.current = new Set(items.map((item) => item.id));
      return;
    }
    const added = items.filter((item) => !seenIds.current.has(item.id));
    seenIds.current = new Set(items.map((item) => item.id));
    if (added.length === 1) setOpenId(added[0].id);
  }, [items, kind]);

  const displayItems = useMemo(
    () => sortItems(items, sort, contactNames),
    [items, sort, contactNames],
  );
  // Manual reorder only makes sense against stored order, not a temporary column sort.
  const canReorder = sort === null;

  const reportListResult = (
    result: { ok: true; warning?: string } | { ok: false; error: string },
  ) => {
    if (!result.ok) {
      setStatus(null);
      setError(result.error);
      return;
    }
    if (result.warning) {
      setStatus(null);
      setError(result.warning);
      return;
    }
    setError(null);
  };

  const exportCsv = () => {
    const exportedAt = new Date();
    const csv = stampExportBody("csv", {
      title: config.title,
      exportedAt,
      payload: itemsToCsv(config.fields, displayItems, contactNames),
    });
    downloadTextFile(exportFilename(config.title, "csv", exportedAt), csv);
  };

  const importCsv = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file later.
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (kind === "contact" && contacts.length === 0) {
        setStatus(null);
        setError("Contacts have not loaded yet. Try again in a moment.");
        return;
      }
      const parsed = parseItemsCsv(config.fields, text);
      const resolved =
        kind === "contact" ? resolveContactCsvRows(parsed.rows, contacts) : null;
      const rows = resolved?.rows ?? parsed.rows;
      const errors = resolved ? [...parsed.errors, ...resolved.errors] : parsed.errors;
      if (rows.length === 0) {
        const first = errors[0];
        setStatus(null);
        setError(
          first?.message ??
            `No ${config.singular} rows found. Export first for a template header.`,
        );
        return;
      }

      void (async () => {
        const result = await onImport(rows);
        if (!result.ok) {
          setStatus(null);
          setError(result.error);
          return;
        }
        const parts = [`Imported ${result.created}`];
        if (errors.length > 0) {
          parts.push(`${errors.length} invalid row(s) ignored`);
        }
        setError(null);
        setStatus(parts.join("; ") + ".");
      })();
    };
    reader.onerror = () => {
      setStatus(null);
      setError("Could not read the CSV file.");
    };
    reader.readAsText(file);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink">
          {config.title}
        </h3>
        <span className="tabular text-[0.75rem] text-ink-faint">{items.length}</span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink"
          >
            CSV Export…
          </button>
          <button
            type="button"
            onClick={() => csvImportRef.current?.click()}
            disabled={busy}
            className="rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          >
            CSV Import…
          </button>
          <input
            ref={csvImportRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={importCsv}
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={busy}
            className="rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised disabled:opacity-40"
          >
            Add {config.singular}
          </button>
        </div>
      </div>

      {(error || status) && (
        <p
          className={`text-[0.75rem] ${error ? "text-priority-a" : "text-ink-muted"}`}
          role={error ? "alert" : "status"}
        >
          {error ?? status}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-rule px-3 py-4 text-center text-[0.8125rem] text-ink-faint">
          {config.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-rule">
          <div className="flex items-center gap-3 border-b border-rule bg-surface-raised px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            {config.columns.map((column) => {
              const active = sort?.column === column ? sort.direction : null;
              return (
                <button
                  key={column}
                  type="button"
                  onClick={() => setSort((current) => cycleItemSort(current, column))}
                  className={`${columnClass(column)} min-w-0 cursor-pointer truncate uppercase tracking-wider hover:text-ink ${
                    column === "priority" ||
                    column === "severity" ||
                    column === "probability" ||
                    column === "score"
                      ? ""
                      : "text-left"
                  }`}
                  aria-label={`Sort by ${columnLabel(config, column)}`}
                >
                  {columnLabel(config, column)}
                  {active === "asc" ? " ↑" : active === "desc" ? " ↓" : ""}
                </button>
              );
            })}
            {/* Spacer matching the row-controls column. */}
            <span className="w-24 flex-none md:w-16" />
          </div>

          <ul>
            {displayItems.map((item, index) => (
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
                  {config.columns.map((column) => {
                    const summary = summaryOf(item, column, contactNames);
                    const emptyPrompt = column === "contactId" ? "Pick a contact" : "—";
                    return (
                      <span
                        key={column}
                        className={`${columnClass(column)} truncate ${
                          column === "priority" ? "tabular" : ""
                        } ${
                          column === "url"
                            ? ""
                            : summary
                              ? "text-ink"
                              : "text-ink-faint"
                        }`}
                      >
                        {column === "url" ? (
                          <UrlCell value={summary} />
                        ) : (
                          summary || emptyPrompt
                        )}
                      </span>
                    );
                  })}

                  <span className="flex flex-none justify-end gap-0.5 md:w-16">
                    <RowButton
                      label="Move up"
                      onClick={() => onMove(item.id, "up")}
                      disabled={busy || !canReorder || index === 0}
                    >
                      ↑
                    </RowButton>
                    <RowButton
                      label="Move down"
                      onClick={() => onMove(item.id, "down")}
                      disabled={
                        busy || !canReorder || index === displayItems.length - 1
                      }
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
                      contacts={contacts}
                      takenContactIds={
                        new Set(
                          items
                            .filter((other) => other.id !== item.id && other.contactId)
                            .map((other) => other.contactId as string),
                        )
                      }
                      busy={busy}
                      onChange={(values) => {
                        const result = onChange(item.id, values);
                        if (result) void result.then(reportListResult);
                      }}
                      onFetchTitle={
                        onFetchTitle
                          ? async () => {
                              reportListResult(await onFetchTitle(item.id));
                            }
                          : undefined
                      }
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

function summaryOf(
  item: NodeItem,
  column: ItemColumnKey,
  contactNames: ReadonlyMap<string, string>,
): string {
  if (column === "priority") {
    return formatPriority(item.priorityLetter, item.priorityRank);
  }

  if (column === "contactId") {
    return item.contactId ? (contactNames.get(item.contactId) ?? "") : "";
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
  contacts,
  takenContactIds,
  busy,
  onChange,
  onFetchTitle,
}: {
  item: NodeItem;
  fields: ItemField[];
  contacts: readonly ContactOption[];
  takenContactIds: ReadonlySet<string>;
  busy: boolean;
  onChange: (values: NodeItemValues) => void;
  onFetchTitle?: () => Promise<void>;
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

          case "contact": {
            const options = contacts.filter(
              (contact) =>
                contact.id === item.contactId || !takenContactIds.has(contact.id),
            );
            return (
              <ContactSelect
                key={field.key}
                label={field.label}
                value={item.contactId}
                onChange={(contactId) => onChange({ contactId })}
                contacts={options}
                emptyLabel="Pick a contact"
              />
            );
          }

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

          default: {
            const fetchTitle =
              field.key === "title" && item.kind === "attachment" && onFetchTitle;
            const fetchDisabledReason = fetchTitle
              ? !item.url.trim()
                ? "URL is blank"
                : normalizeHttpUrl(item.url) === null
                  ? "Not a web URL"
                  : null
              : null;

            return (
              <DraftTextField
                key={field.key}
                label={field.label}
                value={stringValue(item, field.key)}
                onCommit={(value) => onChange({ [field.key]: value })}
                immediateCommit={
                  field.key === "url" && item.kind === "attachment"
                    ? (draft) => normalizeHttpUrl(draft) !== null
                    : undefined
                }
                action={
                  fetchTitle ? (
                    <button
                      type="button"
                      onClick={() => void onFetchTitle()}
                      disabled={busy || fetchDisabledReason !== null}
                      title={fetchDisabledReason ?? undefined}
                      className="min-h-tap shrink-0 rounded border border-rule px-2 py-1 text-[0.75rem] leading-none text-ink-muted transition-colors hover:border-rule-strong hover:bg-surface-raised hover:text-ink disabled:opacity-40 md:min-h-0"
                    >
                      Fetch name from page
                    </button>
                  ) : undefined
                }
              />
            );
          }
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
