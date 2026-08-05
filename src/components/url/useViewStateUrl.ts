"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  hrefWithViewState,
  readViewState,
  type ViewStatePatch,
} from "@/lib/url/viewState";

/**
 * Two-way binding between the address bar and the open drawer / sub-view.
 *
 * - **Drawer open/close** uses `push`, so the browser Back button closes the drawer —
 *   the natural gesture for "I opened this; take me back".
 * - **View switches** use `replace`, so flipping Tasks views does not spam history.
 *
 * Callers that use this must sit under a `<Suspense>` boundary: `useSearchParams`
 * suspends during static rendering.
 */
export function useViewStateUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => readViewState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const navigate = useCallback(
    (patch: ViewStatePatch, history: "push" | "replace") => {
      const href = hrefWithViewState(
        pathname,
        new URLSearchParams(searchParams.toString()),
        patch,
      );
      // Avoid a no-op navigation that still re-renders the page.
      const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      if (href === current) return;

      if (history === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setDetail = useCallback(
    (detail: string | null) => navigate({ detail }, "push"),
    [navigate],
  );

  /**
   * Switching view clears `?mode=`, because a mode override belonged to the view you just left.
   *
   * A module's display mode is now part of what a view stores (Notes' nested/flat), so a
   * lingering param would pin it across every view you picked afterwards — you would switch to
   * a view saved as Nested and get Flat, with nothing on screen explaining why.
   */
  const setView = useCallback(
    (view: string | null) => navigate({ view, mode: null }, "replace"),
    [navigate],
  );

  const setNote = useCallback(
    (note: string | null) => navigate({ note }, "push"),
    [navigate],
  );

  /** Like a view switch, and `replace` for the same reason: it is not a place you came from. */
  const setMode = useCallback(
    (mode: string | null) => navigate({ mode }, "replace"),
    [navigate],
  );

  return {
    detail: state.detail,
    view: state.view,
    note: state.note,
    mode: state.mode,
    setDetail,
    setView,
    setNote,
    setMode,
  };
}
