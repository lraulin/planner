"use client";

import type { NoteFlag } from "@/db/schema";
import { FLAG_CODES, FLAG_LABELS } from "@/lib/notes/flags";

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
