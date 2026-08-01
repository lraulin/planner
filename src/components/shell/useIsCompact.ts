"use client";

import { useSyncExternalStore } from "react";

/**
 * The one breakpoint, read from JS.
 *
 * `md` — 48rem. Below it is the phone; at and above it is the desktop instrument. Every
 * component that has to *render differently* rather than merely restyle branches on this, so
 * there is a single place the line is drawn (`responsive.md`).
 *
 * `useSyncExternalStore` rather than an effect: an effect would paint the desktop grid first
 * and then swap it, which on a phone is a visible flash of a layout that does not fit. The
 * server snapshot is `false` — SSR renders the desktop tree and hydration corrects it, which
 * is the right way round because every page is `force-dynamic` and there is no cached HTML to
 * mismatch.
 *
 * The media query is in rem to match the CSS, so a browser with a non-16px root font size
 * moves both together.
 */
const QUERY = "(max-width: 47.999rem)";

let cached: MediaQueryList | null = null;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  cached ??= window.matchMedia(QUERY);
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const list = mediaQuery();
  if (!list) return () => {};
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return mediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsCompact(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
