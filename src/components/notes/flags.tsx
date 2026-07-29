"use client";

import type { NoteFlag } from "@/db/schema";

/**
 * Achieve's note flags. Eight are pure colours with no meaning attached — that is the
 * point of them; the meaning is whatever the user decides this week — plus `done`, its one
 * semantic entry, and `none`.
 */
export const FLAG_LABELS: Record<NoteFlag, string> = {
  none: "None",
  done: "Done",
  blue: "Blue",
  cyan: "Cyan",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
  red: "Red",
  yellow: "Yellow",
};

/**
 * Colours are given directly rather than through the theme tokens: a flag named "Red" has
 * to look red, so there is nothing to theme. They are picked to stay legible on both the
 * light and dark surfaces.
 */
const FLAG_COLORS: Record<NoteFlag, string | null> = {
  none: null,
  done: "#6b7080",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  green: "#22a06b",
  orange: "#ea8c1a",
  purple: "#a855f7",
  red: "#e2503f",
  yellow: "#d4b106",
};

/** Achieve shows a single letter in the Flag column; the dot carries it for scanning. */
export const FLAG_CODES: Record<NoteFlag, string> = {
  none: "",
  done: "D",
  blue: "B",
  cyan: "C",
  green: "G",
  orange: "O",
  purple: "P",
  red: "R",
  yellow: "Y",
};

export function FlagSwatch({ flag }: { flag: NoteFlag }) {
  const color = FLAG_COLORS[flag];

  return (
    <span
      aria-hidden
      title={FLAG_LABELS[flag]}
      className="inline-block h-2.5 w-2.5 flex-none rounded-full border"
      style={{
        backgroundColor: color ?? "transparent",
        borderColor: color ?? "var(--rule-strong)",
      }}
    />
  );
}

/** The grid cell: a dot plus Achieve's letter code, so it reads without relying on colour. */
export function FlagCell({ flag }: { flag: NoteFlag }) {
  return (
    <span className="flex items-center gap-1.5">
      <FlagSwatch flag={flag} />
      <span className="text-[0.75rem] font-medium text-ink-muted">
        {FLAG_CODES[flag]}
      </span>
      <span className="sr-only">{FLAG_LABELS[flag]}</span>
    </span>
  );
}
