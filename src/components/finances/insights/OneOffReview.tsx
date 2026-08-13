"use client";

import { useState, useTransition } from "react";
import type { OneOffSuggestion } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { setOneOffAction } from "@/app/finances/actions";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { PanelEmpty } from "./Panel";

/**
 * The charges large enough to be an event rather than a month, offered for confirmation.
 *
 * **Nothing here is applied automatically**, and that is the whole design. An annual
 * insurance premium is statistically indistinguishable from a one-off, and excluding it
 * every year would quietly understate what a year costs — the kind of error that gets more
 * confident the longer it runs. So the statistic proposes, the person disposes, and the
 * event name is asked for at the moment someone actually knows it.
 */
export function OneOffReview({ suggestions }: { suggestions: OneOffSuggestion[] }) {
  const formatDate = useDateFormatter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (suggestions.length === 0) {
    return <PanelEmpty>Nothing in this window looks like a one-off.</PanelEmpty>;
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function confirm() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await setOneOffAction(ids, {
        excludeFromBaseline: true,
        eventLabel: label.trim(),
      });
      if (result.ok) {
        setSelected(new Set());
        setLabel("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-rule">
        {suggestions.map((suggestion) => (
          <li key={suggestion.row.id}>
            <label className="flex min-h-tap cursor-pointer items-center gap-2 py-1.5">
              <input
                type="checkbox"
                checked={selected.has(suggestion.row.id)}
                onChange={() => toggle(suggestion.row.id)}
                className="size-4 flex-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] text-ink">
                  {suggestion.merchant || suggestion.row.description}
                </span>
                <span className="block truncate text-[0.75rem] text-ink-muted">
                  {formatDate(suggestion.row.transactionDate)} · {suggestion.category} ·{" "}
                  {Math.round(suggestion.multiple)}× a typical charge
                </span>
              </span>
              <span className="tabular flex-none text-[0.8125rem] text-[var(--chart-spend)]">
                {formatUsd(suggestion.cents)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Event name (Wedding, House move)"
          aria-label="Event name"
          // 16px, or iOS zooms the whole page on focus.
          className="min-h-tap min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:text-[0.8125rem]"
        />
        <button
          type="button"
          onClick={confirm}
          disabled={selected.size === 0 || pending}
          className="min-h-tap rounded border border-rule bg-surface-raised px-3 text-[0.8125rem] text-ink disabled:opacity-50"
        >
          {pending
            ? "Excluding…"
            : `Exclude ${selected.size || ""} from baseline`.replace("  ", " ")}
        </button>
      </div>
      {error && <p className="text-[0.75rem] text-priority-a">{error}</p>}
    </div>
  );
}
