"use client";

import { useId, useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import {
  formatEffort,
  formatPriority,
  parseEffort,
  parsePriority,
} from "@/lib/tree/format";
import { MarkdownEditor } from "@/components/notes/MarkdownEditor";

/**
 * Form primitives for the detail drawer.
 *
 * Two rules from `ux-principles.md` shape all of them:
 *
 * - **Validate on blur, not while typing.** Flagging a half-typed "2 h" as invalid is
 *   noise.
 * - **Unparseable input reverts and flags the field** rather than saving something wrong or
 *   silently clearing it. `parseEffort` and `parsePriority` return `undefined` for
 *   unrecognised input and `null` for cleared, which is what makes the distinction possible.
 *
 * Nothing here is required. Almost no field in this app genuinely has to be filled in, and
 * a form that refuses a partial save produces junk data and abandonment.
 */

const INPUT_CLASS =
  "w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none transition-colors focus:border-select-edge disabled:text-ink-muted";

const INVALID_CLASS = "border-priority-a text-priority-a";

/** Label + control + optional hint, the shape every field below shares. */
function Field({
  label,
  htmlFor,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[0.75rem] text-ink-faint">{hint}</p>}
    </div>
  );
}

/** A responsive grid for laying fields out side by side, as Achieve's forms do. */
export function FieldGrid({
  columns = 2,
  children,
}: {
  columns?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-4 gap-y-3 ${
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
      }`}
    >
      {children}
    </div>
  );
}

/** A titled block within a tab — Achieve's forms group fields under headings like this. */
export function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      {title && (
        <h3 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
  className,
  markdown = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /**
   * When true, the field becomes a markdown editor with an Edit / Preview toggle.
   * Persistence stays with the parent form — this is only the editing surface.
   */
  markdown?: boolean;
}) {
  const id = useId();

  // Long-form prose fields (notes, mission, vision, …) get markdown; short fields stay
  // plain so a one-line "Reason" is not dressed up as a document.
  if (markdown) {
    return (
      <Field label={label} className={className}>
        <MarkdownEditor
          value={value}
          onChange={onChange}
          rows={rows}
          ariaLabel={label}
        />
      </Field>
    );
  }

  return (
    <Field label={label} htmlFor={id} className={className}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} resize-y leading-relaxed`}
      />
    </Field>
  );
}

/**
 * Text that reports on blur rather than on every keystroke.
 *
 * The main forms hold their state in the drawer and write it on Save, so a keystroke costs
 * nothing there. List rows write straight through to the server, the way the outline grid's
 * inline cells do — so they commit once, when the field is done with.
 */
export function DraftTextField({
  label,
  value,
  onCommit,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value);

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => text !== value && onCommit(text)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </Field>
  );
}

export function DraftTextArea({
  label,
  value,
  onCommit,
  rows = 3,
  className,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  rows?: number;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value);

  return (
    <Field label={label} htmlFor={id} className={className}>
      <textarea
        id={id}
        value={text}
        rows={rows}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => text !== value && onCommit(text)}
        className={`${INPUT_CLASS} resize-y leading-relaxed`}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
  emptyLabel = "—",
  hint,
  className,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
        className={`${INPUT_CLASS} cursor-pointer`}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex cursor-pointer select-none items-center gap-2 text-[0.875rem] text-ink">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--select-edge)]"
        />
        {label}
      </label>
      {hint && <p className="pl-[1.375rem] text-[0.75rem] text-ink-faint">{hint}</p>}
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  /** Stored as a timestamp; only the date half is edited. */
  value: Date | null;
  onChange: (value: Date | null) => void;
  className?: string;
}) {
  const id = useId();
  const text = value ? value.toISOString().slice(0, 10) : "";

  return (
    <Field label={label} htmlFor={id} className={className}>
      <input
        id={id}
        type="date"
        value={text}
        onChange={(event) =>
          onChange(
            event.target.value ? new Date(`${event.target.value}T00:00:00`) : null,
          )
        }
        className={`tabular ${INPUT_CLASS}`}
      />
    </Field>
  );
}

/**
 * A whole number within a range — Importance (0–100), Severity, Probability, % complete.
 * Out-of-range or non-numeric input reverts and flags, like every other field here.
 */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  suffix,
  hint,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const stored = value === null ? "" : String(value);
  const [text, setText] = useState(stored);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const trimmed = text.trim();

    if (trimmed === "") {
      setInvalid(false);
      onChange(null);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      setInvalid(true);
      setText(stored);
      return;
    }

    setInvalid(false);
    onChange(parsed);
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={invalid ? `Must be a whole number from ${min} to ${max}.` : hint}
      className={className}
    >
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          value={text}
          onChange={(event) => {
            setInvalid(false);
            setText(event.target.value);
          }}
          onBlur={commit}
          inputMode="numeric"
          aria-invalid={invalid}
          className={`tabular ${INPUT_CLASS} ${invalid ? INVALID_CLASS : ""}`}
        />
        {suffix && <span className="text-[0.8125rem] text-ink-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

/**
 * Currency. Stored as a Postgres `numeric`, which Drizzle hands back as a string, so the
 * string is kept end to end rather than round-tripped through a float.
 */
export function MoneyField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  className?: string;
}) {
  const id = useId();
  const stored = value ?? "";
  const [text, setText] = useState(stored);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const trimmed = text.trim().replace(/[$,]/g, "");

    if (trimmed === "") {
      setInvalid(false);
      onChange(null);
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setInvalid(true);
      setText(stored);
      return;
    }

    setInvalid(false);
    onChange(trimmed);
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={invalid ? "Must be an amount, like 1200 or 1200.50." : undefined}
      className={className}
    >
      <input
        id={id}
        value={text}
        onChange={(event) => {
          setInvalid(false);
          setText(event.target.value);
        }}
        onBlur={commit}
        inputMode="decimal"
        placeholder="0.00"
        aria-invalid={invalid}
        className={`tabular ${INPUT_CLASS} ${invalid ? INVALID_CLASS : ""}`}
      />
    </Field>
  );
}

/** Effort in Achieve's notation, reusing the grid's own parser. */
export function EffortField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (minutes: number | null) => void;
  className?: string;
}) {
  const id = useId();
  const stored = formatEffort(value);
  const [text, setText] = useState(stored);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const minutes = parseEffort(text);

    if (minutes === undefined) {
      setInvalid(true);
      setText(stored);
      return;
    }

    setInvalid(false);
    onChange(minutes);
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={invalid ? "Must look like 45 min, 2 h, 3:45 h, or 3 d." : undefined}
      className={className}
    >
      <input
        id={id}
        value={text}
        onChange={(event) => {
          setInvalid(false);
          setText(event.target.value);
        }}
        onBlur={commit}
        placeholder="—"
        aria-invalid={invalid}
        className={`tabular ${INPUT_CLASS} ${invalid ? INVALID_CLASS : ""}`}
      />
    </Field>
  );
}

/** ABCD priority with an optional rank, typed as "A1" or "A" — as in the grid. */
export function PriorityField({
  label = "Priority",
  letter,
  rank,
  onChange,
  className,
}: {
  label?: string;
  letter: PriorityLetter | null;
  rank: number | null;
  onChange: (letter: PriorityLetter | null, rank: number | null) => void;
  className?: string;
}) {
  const id = useId();
  const stored = formatPriority(letter, rank);
  const [text, setText] = useState(stored);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const parsed = parsePriority(text);

    if (!parsed) {
      setInvalid(true);
      setText(stored);
      return;
    }

    setInvalid(false);
    setText(formatPriority(parsed.letter, parsed.rank));
    onChange(parsed.letter, parsed.rank);
  }

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        invalid ? "Must be A, B, C or D, with an optional rank — like A1." : undefined
      }
      className={className}
    >
      <input
        id={id}
        value={text}
        onChange={(event) => {
          setInvalid(false);
          setText(event.target.value);
        }}
        onBlur={commit}
        placeholder="—"
        maxLength={3}
        aria-invalid={invalid}
        className={`tabular ${INPUT_CLASS} uppercase ${invalid ? INVALID_CLASS : ""}`}
      />
    </Field>
  );
}

/** A free list of context tags, typed comma-separated. */
export function ContextsField({
  value,
  onChange,
  className,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value.join(", "));

  return (
    <Field
      label="Contexts"
      htmlFor={id}
      hint="Comma separated — @home, @calls, errands."
      className={className}
    >
      <input
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() =>
          onChange(
            text
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean),
          )
        }
        className={INPUT_CLASS}
      />
    </Field>
  );
}

/**
 * A value the form shows but cannot set — the effort and completion rollups on a Project.
 * `ux-principles.md`: never offer an editor whose result would be invisible behind a
 * computed value.
 */
export function ReadOnlyField({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <p className="tabular rounded border border-transparent bg-surface-raised px-2 py-1.5 text-[0.875rem] text-ink-muted">
        {value || "—"}
      </p>
    </Field>
  );
}
