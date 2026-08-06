"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { RowClipboard } from "@/lib/grid/rowClipboard";

/**
 * The picked-up rows, shared by every module.
 *
 * Mounted once in `AppShell` rather than per grid, because the move this feature exists for is
 * the cross-module one: picking rows up on the Outline and dropping them under a project you
 * navigated to on Tasks. Dragging can only reach what is on one screen at one time.
 *
 * In memory only. It holds node ids, which mean nothing after a reload — a "Paste" offered on a
 * fresh tab pointing at rows from a previous session is worse than no paste at all.
 */
const RowClipboardContext = createContext<{
  clipboard: RowClipboard | null;
  pickUp: (ids: readonly string[]) => void;
  clear: () => void;
} | null>(null);

export function RowClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<RowClipboard | null>(null);

  const value = useMemo(
    () => ({
      clipboard,
      pickUp: (ids: readonly string[]) =>
        setClipboard(ids.length > 0 ? { ids, count: ids.length } : null),
      clear: () => setClipboard(null),
    }),
    [clipboard],
  );

  return (
    <RowClipboardContext.Provider value={value}>
      {children}
    </RowClipboardContext.Provider>
  );
}

/**
 * Falls back to an inert clipboard outside the provider, so a grid rendered in isolation (a
 * test, a future embed) shows Cut and Paste greyed rather than crashing.
 */
export function useRowClipboard() {
  return (
    useContext(RowClipboardContext) ?? {
      clipboard: null,
      pickUp: () => {},
      clear: () => {},
    }
  );
}
