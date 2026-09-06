"use client";

import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";

/** Standalone calendar-day text with a stable full-date hover value. */
export function DateText({
  dateKey,
  fallback = "",
  className = "",
  title,
}: {
  dateKey: string | null | undefined;
  fallback?: string;
  className?: string;
  /** Replaces the full-date hover, for a date whose *origin* is what needs explaining. */
  title?: string;
}) {
  const formatDate = useDateFormatter();
  const value = formatDate(dateKey);
  const fullDate = formatFullDateKey(dateKey);

  return (
    <span
      title={title ?? (fullDate || undefined)}
      className={`block truncate ${className}`}
    >
      {value || fallback}
    </span>
  );
}
