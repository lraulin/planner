"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isPlainNavigationClick } from "@/lib/navigation/pendingNavigation";
import { pendingNavigation } from "./pendingNavigation";

/**
 * The one link component for in-app navigation inside the shell.
 *
 * `next/link` plus feedback for the moment between click and paint. Two kinds, by whether the
 * destination has an active state somewhere in the chrome:
 *
 * - **`activeLook`** — a module row, a page tab, a bottom-nav slot. The click is recorded in
 *   the shell's pending-navigation store and the destination takes the active look at once
 *   (`usePresentedPathname`); the overlay would only restate it, so it is not drawn.
 * - **Everything else** (Process Inbox, Settings, in-page links) has no active state to move,
 *   so keeps the faint overlay over the link.
 *
 * Either way the click is *recorded*, because the slow-navigation bar is driven by the same
 * record. `useLinkStatus` must run under the `Link` that owns the transition, so the status
 * bridge is a child rather than a class on the anchor, and it is also what tells the store the
 * navigation has ended without arriving (superseded by another click, or failed).
 */

type LinkProps = Omit<ComponentProps<typeof Link>, "children" | "href">;

export function NavLink({
  className,
  children,
  href,
  activeLook = false,
  onClick,
  ...props
}: LinkProps & {
  /** Always a string: a destination with a query is `/path?x=1`, not a `UrlObject`. */
  href: string;
  children: ReactNode;
  /** The destination takes an active look in the chrome, so the overlay is not needed. */
  activeLook?: boolean;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    // After the caller's handler, which may cancel the navigation (or close a sheet first).
    const anchor = event.currentTarget;
    const plain = isPlainNavigationClick({
      button: event.button,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      defaultPrevented: event.defaultPrevented,
      target: anchor.getAttribute("target"),
      download: anchor.hasAttribute("download"),
    });
    if (!plain) return;
    pendingNavigation.begin(window.location.pathname, href, Date.now());
  }

  // `relative` hosts the pending overlay; callers' classNames still win for layout/colour.
  return (
    <Link
      {...props}
      href={href}
      onClick={handleClick}
      className={mergeClass(className, "relative")}
    >
      {children}
      <LinkStatus href={href} overlay={!activeLook} />
    </Link>
  );
}

function LinkStatus({ href, overlay }: { href: string; overlay: boolean }) {
  const { pending } = useLinkStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    // Pending then idle without the address bar having moved is an abandoned or failed
    // navigation: hand the active look back. After an arrival the record is already settled
    // and this finds nothing to clear.
    if (wasPending.current) {
      wasPending.current = false;
      pendingNavigation.end(href);
    }
  }, [pending, href]);

  if (!overlay || !pending) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-surface/50"
    />
  );
}

function mergeClass(base: string | undefined, extra: string): string {
  return base ? `${base} ${extra}` : extra;
}
