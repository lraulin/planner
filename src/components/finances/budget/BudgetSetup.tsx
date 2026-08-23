"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { seedBudgetAction } from "@/app/finances/actions";
import {
  BUDGET_PRESETS,
  PRESET_DESCRIPTIONS,
  PRESET_LABELS,
  type BudgetPreset,
} from "@/lib/finances/budget/presets";
import { formatUsd } from "@/lib/finances/money";

/**
 * The one screen where the product has an opinion, so it states it.
 *
 * Minimal is preselected and labelled recommended. The failure this budget exists to avoid
 * is not overspending — it is abandoning the budget because twenty envelopes turned into
 * shuffling, and that is decided here in one click.
 */
export function BudgetSetup({
  todayKey,
  positionCents,
}: {
  todayKey: string;
  positionCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<BudgetPreset>("minimal");
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await seedBudgetAction(preset, todayKey);
      if (!result.ok) setError(result.error ?? "Could not set the budget up.");
      else router.refresh();
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded border border-rule bg-surface p-4">
      <div>
        <h2 className="text-[1.0625rem] font-medium text-ink">Start a budget</h2>
        <p className="mt-1 text-[0.8125rem] leading-snug text-ink-muted">
          You will start with{" "}
          <span className="tabular text-ink">{formatUsd(positionCents)}</span> to assign
          — checking and cash, less what the cards owe. Savings stays out of it. Nothing
          before this month is touched.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Choose a starting set of envelopes</legend>
        {BUDGET_PRESETS.map((option) => (
          <label
            key={option}
            className={`flex cursor-pointer gap-2 rounded border p-2 ${
              preset === option ? "border-rule-strong bg-surface-raised" : "border-rule"
            }`}
          >
            <input
              type="radio"
              name="preset"
              value={option}
              checked={preset === option}
              onChange={() => setPreset(option)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] text-ink">
                {PRESET_LABELS[option]}
                {option === "minimal" ? (
                  <span className="ml-2 rounded bg-surface-raised px-1 text-[0.6875rem] text-ink-muted">
                    recommended
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-muted">
                {PRESET_DESCRIPTIONS[option]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {error ? (
        <p className="text-[0.8125rem] text-[var(--chart-spend)]">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="self-start rounded border border-rule bg-surface-raised px-3 py-1.5 text-[0.875rem] text-ink hover:bg-surface-raised disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Create budget"}
      </button>

      <p className="text-[0.75rem] leading-snug text-ink-muted">
        Your existing transactions are sorted into these envelopes automatically. You
        can rename, add and remove envelopes afterwards.
      </p>
    </section>
  );
}
