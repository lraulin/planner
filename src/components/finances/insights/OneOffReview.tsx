"use client";

import { useState, useTransition } from "react";
import type { CadenceCandidate, OneOffSuggestion } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { cadenceLabel, type Cadence } from "@/lib/finances/recurringBills";
import { CadenceSelect } from "../CadenceSelect";
import {
  setOneOffAction,
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
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
 *
 * That reasoning needs **three** answers, not two. For most of this list's life it offered
 * only "exclude" and silence, so the bills it warns about above — a semi-annual propane
 * delivery, a car insurance premium — had no correct disposition at all: excluding them is
 * the compounding error, and leaving them meant seeing them again every window forever.
 * Declaring the cadence is the third answer, and where the charges on file already look like
 * a cadence, the answer arrives filled in.
 */
export function OneOffReview({
  suggestions,
  candidates,
}: {
  suggestions: OneOffSuggestion[];
  candidates: CadenceCandidate[];
}) {
  const formatDate = useDateFormatter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [declaring, setDeclaring] = useState<string | null>(null);
  /** Cadence chosen per row, keyed by transaction id. Absent means "whatever was proposed". */
  const [cadences, setCadences] = useState<Record<string, Cadence>>({});

  if (suggestions.length === 0) {
    return <PanelEmpty>Nothing in this window looks like a one-off.</PanelEmpty>;
  }

  const proposals = new Map(
    candidates.map((candidate) => [candidate.merchant, candidate]),
  );

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

  function declare(suggestion: OneOffSuggestion, cadence: Cadence | null) {
    if (cadence === null) return;
    setError(null);
    setDeclaring(suggestion.row.id);
    startTransition(async () => {
      // The charge that prompted the declaration is the best amount available, and storing it
      // is what lets the bill keep its figure in a window holding none of its charges.
      const result = await setRecurringBillAction({
        name: suggestion.merchant,
        cadence,
        expectedCents: suggestion.cents,
        anchorDate: suggestion.row.transactionDate,
      });
      setDeclaring(null);
      if (!result.ok) setError(result.error);
    });
  }

  function declareSpend(suggestion: OneOffSuggestion) {
    setError(null);
    setDeclaring(suggestion.row.id);
    startTransition(async () => {
      const result = await setRecurringSpendAction({
        name: suggestion.merchant,
        matchers: [suggestion.merchant],
      });
      setDeclaring(null);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-rule">
        {suggestions.map((suggestion) => {
          const proposed = proposals.get(suggestion.merchant);
          return (
            <li key={suggestion.row.id} className="flex flex-col gap-1 py-1.5">
              <label className="flex min-h-tap cursor-pointer items-center gap-2">
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
                    {formatDate(suggestion.row.transactionDate)} · {suggestion.category}{" "}
                    · {Math.round(suggestion.multiple)}× a typical charge
                  </span>
                </span>
                <span className="tabular flex-none text-[0.8125rem] text-[var(--chart-spend)]">
                  {formatUsd(suggestion.cents)}
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2 pl-6">
                <span className="text-[0.75rem] text-ink-muted">
                  {proposed
                    ? `Looks like a bill ${cadenceLabel(proposed.cadence).toLowerCase()} —`
                    : "Or, if it repeats:"}
                </span>
                <CadenceSelect
                  value={
                    cadences[suggestion.row.id] ??
                    proposed?.cadence ?? { unit: "month", n: 1 }
                  }
                  disabled={pending}
                  ariaLabel={`Bill cadence for ${suggestion.merchant || suggestion.row.description}`}
                  onChange={(cadence) =>
                    setCadences((current) => ({
                      ...current,
                      [suggestion.row.id]: cadence,
                    }))
                  }
                  // 16px, or iOS zooms the whole page on focus.
                  className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.75rem]"
                />
                {/*
                 * A button rather than declaring on change. When the cadence arrives
                 * pre-filled — the case this whole flow exists for — picking the option
                 * already selected fires no change event at all, so a proposal would be the
                 * one row nobody could accept.
                 */}
                <button
                  type="button"
                  onClick={() =>
                    declare(
                      suggestion,
                      cadences[suggestion.row.id] ?? proposed?.cadence ?? null,
                    )
                  }
                  disabled={
                    pending ||
                    (cadences[suggestion.row.id] ?? proposed?.cadence ?? null) === null
                  }
                  className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                >
                  {declaring === suggestion.row.id ? "Declaring…" : "It's a bill"}
                </button>
                <button
                  type="button"
                  onClick={() => declareSpend(suggestion)}
                  disabled={pending}
                  className="min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                >
                  Track as spend
                </button>
              </div>
            </li>
          );
        })}
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
