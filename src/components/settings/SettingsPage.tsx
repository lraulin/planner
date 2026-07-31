"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { useAllSettings } from "@/components/settings/SettingsProvider";
import { describeScope } from "@/lib/settings/scopes";

/**
 * Global preference reset surface.
 *
 * Each stored scope is listed with a human label and a one-click Reset. "Reset everything"
 * is the only bulk action, and it goes through a destructive confirm — wiping every grid
 * layout, filter, and chooser weight at once is not a gesture to fire by accident.
 */
export function SettingsPage() {
  const { scopes, resetScope, resetAll, saveError } = useAllSettings();
  const [confirmingAll, setConfirmingAll] = useState(false);
  const headingId = useId();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-auto px-6 py-8">
      <header className="mb-6">
        <h1 id={headingId} className="text-lg font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-muted">
          Display preferences for grids, filters, and the Task Chooser. Resetting a row
          restores that piece to its default; the rest of your data is untouched.
        </p>
      </header>

      {saveError && (
        <p
          role="alert"
          className="mb-4 rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a"
        >
          {saveError}
        </p>
      )}

      <section aria-labelledby={headingId} className="rounded border border-rule">
        <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-raised px-4 py-2.5">
          <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-muted">
            Saved preferences
          </h2>
          <button
            type="button"
            onClick={() => setConfirmingAll(true)}
            disabled={scopes.length === 0}
            className="rounded border border-priority-a/50 bg-priority-a/10 px-2.5 py-1 text-[0.8125rem] font-medium text-priority-a transition-colors hover:bg-priority-a/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset everything
          </button>
        </div>

        {scopes.length === 0 ? (
          <p className="px-4 py-8 text-center text-[0.875rem] text-ink-faint">
            Nothing stored yet. Column layouts, filters, and chooser weights appear here
            once you change them.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {scopes.map((scope) => (
              <li
                key={scope}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-medium text-ink">
                    {describeScope(scope)}
                  </p>
                  <p className="truncate font-mono text-[0.6875rem] text-ink-faint">
                    {scope}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => resetScope(scope)}
                  className="flex-none rounded border border-rule px-2.5 py-1 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised"
                >
                  Reset
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmingAll}
        title="Reset every preference?"
        message="Column layouts, filters, sort, group collapse, Task Chooser weights, Outline type filters, Notes filters, and drawer tabs all return to their defaults. Your outline, tasks, and notes are not affected."
        confirmLabel="Reset everything"
        cancelLabel="Keep preferences"
        destructive
        onConfirm={() => {
          resetAll();
          setConfirmingAll(false);
        }}
        onCancel={() => setConfirmingAll(false)}
      />
    </main>
  );
}
