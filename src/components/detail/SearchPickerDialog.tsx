"use client";

import { useId, type ReactNode } from "react";
import { ModalShell } from "@/components/detail/ModalShell";

/**
 * The frame of a search-then-pick dialog: title, a line of explanation, an autofocused
 * search box, the scrolling list of matches the caller renders, and a footer whose Cancel
 * is always there. `footerStart` sits at the footer's left (a selection count); `actions`
 * sit after Cancel.
 */
export function SearchPickerDialog({
  title,
  description,
  placeholder,
  query,
  onQueryChange,
  onClose,
  children,
  footerStart,
  actions,
}: {
  title: string;
  description: ReactNode;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  children: ReactNode;
  footerStart?: ReactNode;
  actions?: ReactNode;
}) {
  const titleId = useId();
  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          {description}
        </p>

        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="mt-4 min-h-tap rounded border border-rule bg-surface px-3 py-2 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-rule">
          {children}
        </div>

        <div
          className={`mt-4 flex items-center gap-3 ${footerStart ? "justify-between" : "justify-end"}`}
        >
          {footerStart}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            >
              Cancel
            </button>
            {actions}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

/** The centred line a picker shows when nothing matches. */
export function NoMatches({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-[0.8125rem] text-ink-muted">{children}</p>
  );
}
