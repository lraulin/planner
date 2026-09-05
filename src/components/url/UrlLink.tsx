"use client";

import { normalizeHttpUrl } from "@/lib/url/pageTitle";
import { urlHostLabel } from "@/lib/url/displayUrl";

/**
 * A stored URL, rendered as a link you can actually click.
 *
 * **Why this is shared.** Every module that stores a link had grown its own anchor, and
 * most of them wrote `href={value}` against a free-text field. A bare `chase.com` is not a
 * URL to the browser — it is a *relative* path, so the link navigated inside the app. This
 * routes all of them through `normalizeHttpUrl`, which supplies the missing scheme and
 * returns null for anything that is not http(s), so junk (and `javascript:`) falls back to
 * plain text instead of becoming a live link.
 *
 * **Why it stops propagation.** These sit inside `DataGrid` rows, where a click selects the
 * row and a double-click opens the drawer. Following the link should do neither.
 *
 * `children` is the label when the link is on something other than the URL itself — the
 * account name linked to the bank site. Without it the URL is its own label, shortened to
 * the host when `display="host"`.
 */
export function UrlLink({
  value,
  children,
  display = "full",
  className = "",
  empty = null,
}: {
  value: string;
  children?: React.ReactNode;
  /** `host` is for narrow columns: `chase.com` instead of the whole query string. */
  display?: "full" | "host";
  className?: string;
  /** Shown when there is no usable link and no `children` to fall back on. */
  empty?: React.ReactNode;
}) {
  const href = normalizeHttpUrl(value);
  const label = children ?? (display === "host" ? urlHostLabel(value) : value.trim());

  if (href === null) {
    if (children === undefined && !label) return <>{empty}</>;
    return (
      <span className={`truncate ${className}`} title={value || undefined}>
        {children ?? label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={value}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={`truncate underline-offset-2 hover:underline ${className}`}
    >
      {label}
    </a>
  );
}
