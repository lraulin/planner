"use client";

import type { NotesPresentation } from "@/lib/settings/notes";

/** Lens control: Grid | Journal, same shape as Schedule Calendar | Agenda. */
export function NotesPresentationSwitch({
  value,
  onChange,
}: {
  value: NotesPresentation;
  onChange: (next: NotesPresentation) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Notes presentation"
      className="flex flex-none overflow-hidden rounded border border-rule"
    >
      {(
        [
          ["grid", "Grid", "The nested notes list"],
          ["journal", "Journal", "Calendar, date tree, and a write pane"],
        ] as const
      ).map(([mode, label, title]) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          title={title}
          onClick={() => onChange(mode)}
          className={[
            "min-h-tap px-2 py-1 text-[0.8125rem] leading-none whitespace-nowrap transition-colors md:min-h-0",
            value === mode
              ? "bg-select text-ink"
              : "text-ink-muted hover:bg-surface-raised hover:text-ink",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
