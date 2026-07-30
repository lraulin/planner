"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { EMPTY_NOTE_FILTER, type MatchMode, type NoteFilter } from "@/lib/notes/filter";

/**
 * Achieve's "Note Item Filter". A dialog is right here under `ux-principles.md`: it is a
 * blocking configuration step the user explicitly asked for, not a record editor — the
 * same class as `ShowFieldsDialog`.
 *
 * Edits are held locally and applied on OK, so a half-built filter never re-runs against
 * the grid on every keystroke.
 */
export function NoteFilterDialog({
  open,
  filter,
  subjects,
  contexts,
  onApply,
  onClose,
}: {
  open: boolean;
  filter: NoteFilter;
  subjects: string[];
  contexts: string[];
  onApply: (filter: NoteFilter) => void;
  onClose: () => void;
}) {
  // Unmount when closed so the next open remounts with a fresh draft of `filter`.
  // That is what makes Cancel discard — no setState-in-effect reseed needed.
  if (!open) return null;

  return (
    <NoteFilterDialogBody
      filter={filter}
      subjects={subjects}
      contexts={contexts}
      onApply={onApply}
      onClose={onClose}
    />
  );
}

function NoteFilterDialogBody({
  filter,
  subjects,
  contexts,
  onApply,
  onClose,
}: {
  filter: NoteFilter;
  subjects: string[];
  contexts: string[];
  onApply: (filter: NoteFilter) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<NoteFilter>(filter);

  const patch = (changes: Partial<NoteFilter>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // `open` is hardcoded because the wrapper above unmounts this body when it closes.
  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-[34rem]">
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Filter notes
        </h2>

        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                Search for
              </span>
              <input
                value={draft.search}
                onChange={(event) => patch({ search: event.target.value })}
                autoFocus
                placeholder="Words to find"
                className={INPUT_CLASS}
              />
            </label>
            <AllAnyToggle
              value={draft.searchMode}
              onChange={(searchMode) => patch({ searchMode })}
              label="How search terms combine"
            />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 pl-0.5">
            <Check
              checked={draft.searchInTitle}
              onChange={(searchInTitle) => patch({ searchInTitle })}
              label="in title"
            />
            <Check
              checked={draft.searchInBody}
              onChange={(searchInBody) => patch({ searchInBody })}
              label="in notes"
            />
            <Check
              checked={draft.searchInOtherFields}
              onChange={(searchInOtherFields) => patch({ searchInOtherFields })}
              label="in other text fields"
            />
          </div>
        </section>

        <hr className="border-rule" />

        <TokenRow
          label="Subject"
          values={draft.subjects}
          options={subjects}
          mode={draft.subjectMode}
          onChangeValues={(subjectsNext) => patch({ subjects: subjectsNext })}
          onChangeMode={(subjectMode) => patch({ subjectMode })}
        />

        <TokenRow
          label="Contexts"
          values={draft.contexts}
          options={contexts}
          mode={draft.contextMode}
          onChangeValues={(contextsNext) => patch({ contexts: contextsNext })}
          onChangeMode={(contextMode) => patch({ contextMode })}
        />

        <hr className="border-rule" />

        <div className="flex items-center gap-4">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Across criteria
          </span>
          <Radio
            name="matchMode"
            checked={draft.matchMode === "all"}
            onChange={() => patch({ matchMode: "all" })}
            label="Match All"
          />
          <Radio
            name="matchMode"
            checked={draft.matchMode === "any"}
            onChange={() => patch({ matchMode: "any" })}
            label="Match Any"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_NOTE_FILTER)}
            className={BUTTON_CLASS}
          >
            Clear All
          </button>
          <button type="button" onClick={onClose} className={BUTTON_CLASS}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="rounded border border-select-edge bg-select px-3 py-1 text-[0.8125rem] leading-none font-medium text-ink transition-colors hover:brightness-95"
          >
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink outline-none transition-colors focus:border-select-edge";

const BUTTON_CLASS =
  "rounded border border-rule px-3 py-1 text-[0.8125rem] leading-none text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised";

/** Multi-select over known values, which is what Subject and Contexts both need. */
function TokenRow({
  label,
  values,
  options,
  mode,
  onChangeValues,
  onChangeMode,
}: {
  label: string;
  values: string[];
  options: string[];
  mode: MatchMode;
  onChangeValues: (values: string[]) => void;
  onChangeMode: (mode: MatchMode) => void;
}) {
  const toggle = (option: string) =>
    onChangeValues(
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    );

  return (
    <section className="flex items-start gap-2">
      <span className="mt-1.5 w-[4.5rem] flex-none text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </span>

      <div className="flex min-h-[1.9rem] flex-1 flex-wrap items-center gap-1.5">
        {options.length === 0 ? (
          <span className="text-[0.8125rem] text-ink-faint">None in use yet.</span>
        ) : (
          options.map((option) => {
            const active = values.includes(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(option)}
                className={[
                  "rounded-full border px-2 py-0.5 text-[0.75rem] leading-tight transition-colors",
                  active
                    ? "border-select-edge bg-select text-ink"
                    : "border-rule text-ink-muted hover:border-rule-strong hover:text-ink",
                ].join(" ")}
              >
                {option}
              </button>
            );
          })
        )}
      </div>

      <AllAnyToggle
        value={mode}
        onChange={onChangeMode}
        label={`How ${label.toLowerCase()} values combine`}
      />
    </section>
  );
}

function AllAnyToggle({
  value,
  onChange,
  label,
}: {
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="mt-[1.15rem] flex flex-none overflow-hidden rounded border border-rule"
    >
      {(["all", "any"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={[
            "px-2 py-1 text-[0.75rem] leading-none capitalize transition-colors",
            value === option
              ? "bg-select font-medium text-ink"
              : "text-ink-muted hover:bg-surface-raised hover:text-ink",
          ].join(" ")}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
      {label}
    </label>
  );
}

function Radio({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[0.8125rem] text-ink-muted">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-[var(--select-edge)]"
      />
      {label}
    </label>
  );
}
