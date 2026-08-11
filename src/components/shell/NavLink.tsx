"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * `next/link` with immediate pending feedback via `useLinkStatus`.
 *
 * Warm navigations are already quick; the gap that still feels slow is the moment between
 * click and paint. A light overlay closes that gap without rearranging flex children —
 * `useLinkStatus` must run under the `Link` that owns the transition, so the indicator is
 * a child rather than a class on the anchor.
 */

type LinkProps = Omit<ComponentProps<typeof Link>, "children">;

export function NavLink({
  className,
  children,
  ...props
}: LinkProps & { children: ReactNode }) {
  // `relative` hosts the pending overlay; callers' classNames still win for layout/colour.
  return (
    <Link {...props} className={mergeClass(className, "relative")}>
      {children}
      <PendingOverlay />
    </Link>
  );
}

function PendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
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
