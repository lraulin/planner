"use client";

import { useState } from "react";

/**
 * A stored link, shown as a link and edited on purpose.
 *
 * **Why two modes.** One click cannot both follow a link and put a caret in a text box, so a
 * cell that is a bare `<input type="url">` — which this was — can hold a URL you can never
 * click, and a cell that is a bare `<a>` holds one you can never fix. Separating them is the
 * standard answer for an editable-link cell, and it is what the read mode buys: the hostname
 * alone, which is the part worth reading in a 7rem column.
 *
 * The pencil sits at low opacity rather than appearing on row hover: `DataGrid` puts no group
 * class on its rows to hang a `group-hover` off, and a hover-only control is unreachable from
 * a keyboard anyway. It is a real button in the tab order with a `title`, which
 * `components/ux-principles` requires of any icon-only button.
 *
 * Empty renders as **Add link** rather than an empty borderless box, which in a dense grid is
 * indistinguishable from a cell that cannot be edited at all.
 */
export function UrlCell({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onCommit: (url: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    return (
      <input
        type="url"
        value={draft}
        autoFocus
        disabled={disabled}
        aria-label={`URL for ${label}`}
        placeholder="https://…"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(null);
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          const next = withScheme(draft.trim());
          setDraft(null);
          if (next !== value) onCommit(next);
        }}
        className="w-full rounded border border-rule bg-surface px-1 text-[0.75rem] text-ink"
      />
    );
  }

  if (value === "") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setDraft("")}
        className="min-h-tap text-[0.75rem] text-ink-muted hover:text-ink md:min-h-0"
      >
        Add link
      </button>
    );
  }

  return (
    <span className="flex min-w-0 items-center gap-1">
      <a
        href={withScheme(value)}
        target="_blank"
        rel="noopener noreferrer"
        title={value}
        className="min-w-0 truncate text-[0.75rem] text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink"
      >
        {hostLabel(value)}
      </a>
      <button
        type="button"
        disabled={disabled}
        title={`Edit URL for ${label}`}
        aria-label={`Edit URL for ${label}`}
        onClick={() => setDraft(value)}
        className="shrink-0 text-[0.75rem] text-ink-faint opacity-60 hover:text-ink hover:opacity-100 focus-visible:opacity-100"
      >
        ✎
      </button>
    </span>
  );
}

/** A bare `geico.com` is a URL the user meant; the browser needs the scheme spelled out. */
export function withScheme(url: string): string {
  if (url === "") return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
}

/** The part worth reading: the host, without the scheme, `www.`, or the path. */
function hostLabel(url: string): string {
  try {
    return new URL(withScheme(url)).hostname.replace(/^www\./, "");
  } catch {
    // Not parseable as a URL — show what was typed rather than an error. The link still
    // renders; the browser gets to decide what it means.
    return url;
  }
}
