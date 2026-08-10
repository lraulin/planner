"use client";

import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";

/** Standalone calendar-day text with a stable full-date hover value. */
export function DateText({
  dateKey,
  fallback = "",
  className = "",
}: {
  dateKey: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const formatDate = useDateFormatter();
  const value = formatDate(dateKey);
  const fullDate = formatFullDateKey(dateKey);

  return (
    <span title={fullDate || undefined} className={`block truncate ${className}`}>
      {value || fallback}
    </span>
  );
}
