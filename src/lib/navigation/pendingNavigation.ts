/**
 * What the shell shows while a navigation is under way.
 *
 * Next's router keeps the old page on screen until the new one's data has arrived, which is the
 * right behaviour (a placeholder that replaces content flashes on every 200–300 ms switch) and
 * leaves one gap: for that whole wait nothing says the click registered. This module is the
 * shell's answer, kept React-free so the rules are testable:
 *
 * - **The destination takes the active look at once** (`presentedPathname`). The sidebar row,
 *   page tab and bottom-nav slot are resolved from this instead of the address bar, so the
 *   click is acknowledged within a frame.
 * - **A slow navigation gets a bar, and only a slow one** (`progressVisible`). Under
 *   `NAVIGATION_PROGRESS_DELAY_MS` nothing extra is drawn.
 * - **It returns to where the address bar is** when the navigation is abandoned, fails, or
 *   finishes somewhere other than where it was headed (a redirect): a pending record is only
 *   ever live at the pathname it began from (`livePending`).
 *
 * A **same-page** URL change (a drawer opening, a view switch, a query-only link) is not a
 * navigation for this purpose and never becomes pending — it has no active state to move and
 * would otherwise dim a page that is not going anywhere.
 */

/** A navigation still pending after this long gets the progress bar and the dimming. */
export const NAVIGATION_PROGRESS_DELAY_MS = 300;

/**
 * A pending record older than this is dropped, so a navigation nothing reported the end of
 * (a `router.push`, which has no completion signal) cannot leave the wrong row lit forever.
 */
export const NAVIGATION_ABANDON_MS = 30_000;

export type PendingNavigation = {
  /** The destination exactly as the link or command gave it, query included. */
  href: string;
  /** The address bar's pathname when it began. The record is live only while it still is. */
  fromPathname: string;
  /** `Date.now()` at the click. */
  startedAt: number;
  /**
   * `navigate` moves the active look and waits the delay before drawing the bar. `refresh` is
   * the arrival refresh of a cached page that may be behind (`freshness.ts`): there is no
   * destination to light, and the content is already stale, so the bar shows from the start.
   */
  kind: "navigate" | "refresh";
};

/** The pathname part of an href — everything before `?` or `#`. */
export function pathnameOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

/**
 * A pending record for a click at `fromPathname` heading to `href`, or `null` when there is
 * nothing to present: the destination is the page you are already on.
 */
export function beginNavigation(
  fromPathname: string,
  href: string,
  now: number,
): PendingNavigation | null {
  if (pathnameOf(href) === fromPathname) return null;
  return { href, fromPathname, startedAt: now, kind: "navigate" };
}

export function beginRefresh(pathname: string, now: number): PendingNavigation {
  return { href: pathname, fromPathname: pathname, startedAt: now, kind: "refresh" };
}

/**
 * The record, if it is still the navigation in flight at `pathname`.
 *
 * The address bar moving off `fromPathname` is the arrival signal and also the redirect and
 * supersede signal, so a record never has to be told it finished — only the stale one has to
 * be dropped (`settle`) before the user comes back to the page it began on.
 */
export function livePending(
  pending: PendingNavigation | null,
  pathname: string,
): PendingNavigation | null {
  return pending && pending.fromPathname === pathname ? pending : null;
}

/**
 * The pathname the chrome should present as "where you are": the destination of a live
 * navigation, otherwise the real one. Feed it to `pageForPathname` / `moduleForPathname`, which
 * already resolve a focused flow to no tab and an unknown path to no module.
 */
export function presentedPathname(
  pathname: string,
  pending: PendingNavigation | null,
): string {
  const live = livePending(pending, pathname);
  return live && live.kind === "navigate" ? pathnameOf(live.href) : pathname;
}

/** How long after it began the bar should show: immediately for a refresh, else the delay. */
export function progressDelayMs(pending: PendingNavigation): number {
  return pending.kind === "refresh" ? 0 : NAVIGATION_PROGRESS_DELAY_MS;
}

/** Whether the bar and the dimming should be drawn at `now`. */
export function progressVisible(
  pending: PendingNavigation | null,
  pathname: string,
  now: number,
): boolean {
  const live = livePending(pending, pathname);
  return live !== null && now - live.startedAt >= progressDelayMs(live);
}

export function isAbandoned(pending: PendingNavigation | null, now: number): boolean {
  return pending !== null && now - pending.startedAt >= NAVIGATION_ABANDON_MS;
}

/**
 * The link for `href` reports it is no longer pending. Clears only that navigation: a newer
 * click has already replaced the record, and the old link going idle must not clear it.
 */
export function endNavigation(
  pending: PendingNavigation | null,
  href: string,
): PendingNavigation | null {
  return pending && pending.kind === "navigate" && pending.href === href
    ? null
    : pending;
}

/** The address bar is at `pathname`: drop a record that began somewhere else. */
export function settleAt(
  pending: PendingNavigation | null,
  pathname: string,
): PendingNavigation | null {
  return pending && pending.fromPathname !== pathname ? null : pending;
}

/**
 * Whether a click will be handled as an in-app navigation by `next/link`: a plain left click
 * that nothing cancelled, on a link that does not open elsewhere. Mirrors the router's own
 * test, because marking a modified click (open in a new tab) pending would light a destination
 * the page never goes to, and nothing would ever clear it.
 */
export function isPlainNavigationClick(click: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target?: string | null;
  download?: boolean;
}): boolean {
  if (click.defaultPrevented || click.button !== 0 || click.download) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  return !click.target || click.target === "_self";
}

/**
 * The pending record as an external store, so the sidebar, the bars and the commands that
 * start a navigation share one without a provider. A factory, not a module-level value, so
 * tests build their own; the shell holds the one real instance.
 */
export type PendingNavigationStore = ReturnType<typeof createPendingNavigationStore>;

export function createPendingNavigationStore() {
  let state: PendingNavigation | null = null;
  const listeners = new Set<() => void>();

  function set(next: PendingNavigation | null) {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** A click at `fromPathname` toward `href`. A same-page click clears an older record. */
    begin(fromPathname: string, href: string, now: number) {
      set(beginNavigation(fromPathname, href, now));
    },
    beginRefresh(pathname: string, now: number) {
      set(beginRefresh(pathname, now));
    },
    end(href: string) {
      set(endNavigation(state, href));
    },
    /** The arrival refresh produced a new payload. */
    endRefresh() {
      if (state?.kind === "refresh") set(null);
    },
    settle(pathname: string) {
      set(settleAt(state, pathname));
    },
    clear() {
      set(null);
    },
  };
}
