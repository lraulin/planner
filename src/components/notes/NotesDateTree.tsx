"use client";

import { JOURNAL_SUBJECT } from "@/lib/day/types";
import type { DiaryTree } from "@/lib/notes/diaryTree";

function dayNumber(dateKey: string): string {
  return String(Number(dateKey.slice(8)));
}

export function NotesDateTree({
  tree,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  tree: DiaryTree;
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
}) {
  if (tree.years.length === 0) {
    return (
      <p className="px-2 py-3 text-[0.75rem] text-ink-faint">
        No journal entries yet. Pick a day and start typing.
      </p>
    );
  }

  return (
    <ul className="text-[0.8125rem]">
      {tree.years.map((year) => {
        const yearOpen = expanded.has(year.key);
        return (
          <li key={year.key}>
            <TreeTwist
              open={yearOpen}
              label={year.key}
              onToggle={() => onToggle(year.key)}
            />
            {yearOpen && (
              <ul className="pl-3">
                {year.months.map((month) => {
                  const monthOpen = expanded.has(month.key);
                  return (
                    <li key={month.key}>
                      <TreeTwist
                        open={monthOpen}
                        label={month.label}
                        onToggle={() => onToggle(month.key)}
                      />
                      {monthOpen && (
                        <ul className="pl-3">
                          {month.entries.map((entry) => {
                            const selected = entry.id === selectedId;
                            const prefix =
                              entry.subject === JOURNAL_SUBJECT ? "" : "RN ";
                            const label = entry.snippet
                              ? `${dayNumber(entry.dateKey)} — ${prefix}${entry.snippet}`
                              : `${dayNumber(entry.dateKey)}`;
                            return (
                              <li key={entry.id}>
                                <button
                                  type="button"
                                  onClick={() => onSelect(entry.id)}
                                  className={[
                                    "flex min-h-tap w-full items-center truncate px-1.5 py-0.5 text-left md:min-h-0",
                                    selected
                                      ? "bg-select text-ink"
                                      : "text-ink hover:bg-surface-raised",
                                  ].join(" ")}
                                  title={label}
                                >
                                  {label}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeTwist({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex min-h-tap w-full items-center gap-1 px-1.5 py-0.5 text-left text-ink md:min-h-0"
      aria-expanded={open}
    >
      <span className="w-3 flex-none text-ink-faint" aria-hidden>
        {open ? "▾" : "▸"}
      </span>
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}
