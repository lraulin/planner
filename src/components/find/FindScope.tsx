"use client";

import { useState } from "react";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { FIELD_CLASS_LABELS, FIND_SOURCES } from "@/lib/find/sources";
import { summarizeFindScope } from "@/lib/find/summary";
import {
  FIND_FIELD_CLASSES,
  type FindFieldClass,
  type FindIncludeOptions,
  type FindMatchOptions,
  type FindSourceId,
} from "@/lib/find/types";
import type { FindSettings } from "@/lib/settings/find";

function Chip({
  label,
  on,
  onToggle,
  title,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={title}
      className={`min-h-tap rounded border px-2 py-1 text-[0.75rem] md:min-h-0 ${
        on
          ? "border-rule-strong bg-select text-ink"
          : "border-rule text-ink-faint hover:border-rule-strong hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full text-[0.6875rem] uppercase tracking-wide text-ink-faint md:w-auto md:pr-1">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Achieve's "Search In" and "Options" boxes, as toggle chips rather than a wall of
 * checkboxes.
 *
 * On the desktop everything is on screen at once, the way Achieve had it. A popover per group
 * would be tidier and worse: these are the controls that explain what the results are, and
 * hiding them behind three buttons puts the answer to "why is that not in the list" two clicks
 * away. Sixteen chips fit three rows at 1280.
 *
 * **Below `md` they start collapsed**, behind a summary of what is on. At tap size the same
 * sixteen chips are 950px tall on an 844px screen, so the results — the entire point of the
 * page — would begin below the fold. This is `responsive.md`'s rule rather than an exception
 * to it: the compact layout is a different information architecture over the same controls,
 * not the desktop one scrolled.
 */

export function FindScope({
  settings,
  onChange,
}: {
  settings: FindSettings;
  onChange: (next: FindSettings) => void;
}) {
  const isCompact = useIsCompact();
  const [open, setOpen] = useState(false);

  /**
   * Unticking the last box is refused rather than allowed.
   *
   * An empty selection cannot express anything useful here: it would mean "search nothing",
   * and a Find that can never match reads as broken rather than as narrowed. Same reason
   * `data-grid.md` has no "select none" on a set filter — a control that can put the surface
   * into a state it cannot describe is worse than one without it.
   */
  function toggleSource(id: FindSourceId) {
    const on = settings.sources.includes(id);
    if (on && settings.sources.length === 1) return;
    onChange({
      ...settings,
      sources: on
        ? settings.sources.filter((entry) => entry !== id)
        : [...settings.sources, id],
    });
  }

  function toggleFieldClass(id: FindFieldClass) {
    const on = settings.fieldClasses.includes(id);
    if (on && settings.fieldClasses.length === 1) return;
    onChange({
      ...settings,
      fieldClasses: on
        ? settings.fieldClasses.filter((entry) => entry !== id)
        : [...settings.fieldClasses, id],
    });
  }

  function toggleMatch(key: keyof FindMatchOptions) {
    onChange({
      ...settings,
      match: { ...settings.match, [key]: !settings.match[key] },
    });
  }

  function toggleInclude(key: keyof FindIncludeOptions) {
    onChange({
      ...settings,
      include: { ...settings.include, [key]: !settings.include[key] },
    });
  }

  const lastSource = settings.sources.length === 1;
  const lastClass = settings.fieldClasses.length === 1;

  if (isCompact && !open) {
    return (
      <div className="flex flex-none border-b border-rule px-3 pb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-tap w-full rounded border border-rule px-2 py-1 text-left text-[0.75rem] text-ink-muted"
        >
          Searching {summarizeFindScope(settings)} ▾
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-b border-rule px-3 pb-2">
      {isCompact && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-tap w-full rounded border border-rule px-2 py-1 text-left text-[0.75rem] text-ink-muted"
        >
          Searching {summarizeFindScope(settings)} ▴
        </button>
      )}
      <Group label="Search in">
        {FIND_SOURCES.map((source) => {
          const on = settings.sources.includes(source.id);
          return (
            <Chip
              key={source.id}
              label={source.label}
              on={on}
              onToggle={() => toggleSource(source.id)}
              title={
                on && lastSource
                  ? "At least one source has to stay on"
                  : `Search ${source.label}`
              }
            />
          );
        })}
      </Group>

      <Group label="Fields">
        {FIND_FIELD_CLASSES.map((id) => {
          const on = settings.fieldClasses.includes(id);
          return (
            <Chip
              key={id}
              label={FIELD_CLASS_LABELS[id]}
              on={on}
              onToggle={() => toggleFieldClass(id)}
              title={
                on && lastClass
                  ? "At least one field type has to stay on"
                  : `Search ${FIELD_CLASS_LABELS[id].toLowerCase()}`
              }
            />
          );
        })}
      </Group>

      <Group label="Options">
        <Chip
          label="Match case"
          on={settings.match.matchCase}
          onToggle={() => toggleMatch("matchCase")}
          title="Only match the same capitalisation"
        />
        <Chip
          label="Whole word"
          on={settings.match.wholeWord}
          onToggle={() => toggleMatch("wholeWord")}
          title="Skip hits inside a longer word"
        />
        <Chip
          label="Regex"
          on={settings.match.regex}
          onToggle={() => toggleMatch("regex")}
          title="Read the query as a regular expression"
        />
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden />
        <Chip
          label="Completed"
          on={settings.include.completed}
          onToggle={() => toggleInclude("completed")}
          title="Include completed and cancelled items"
        />
        <Chip
          label="Past & shelved"
          on={settings.include.shelved}
          onToggle={() => toggleInclude("shelved")}
          title="Include postponed items and appointments that have already happened"
        />
      </Group>
    </div>
  );
}
