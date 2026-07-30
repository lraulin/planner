"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_WEIGHTS, type ChooserWeights } from "@/lib/chooser/score";
import type { ChooserSettings, ChooserViewId } from "@/lib/chooser/types";
import { defaultSettings } from "@/lib/chooser/views";

/**
 * Task Chooser settings, persisted to `localStorage` **per view** — Achieve keeps separate
 * scoring settings for each view, and so do we.
 *
 * Same trade `useGridColumns` already makes for column layout: no migration, no server
 * action, at the cost of not following you to another device. Scoring weights are display
 * tuning, not data.
 *
 * Read through `useSyncExternalStore` so the server render and first paint both show the
 * view defaults, and the client adopts what is stored without an effect (and so without a
 * flash of the wrong ordering).
 */

function storageKey(viewId: ChooserViewId): string {
  return `planner.chooser.settings.${viewId}`;
}

/** Only ever hands back the raw string, so the snapshot is referentially stable. */
function readRaw(viewId: ChooserViewId): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(viewId));
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Merge stored values over the view's defaults, ignoring anything malformed. A weight that
 * arrives as a string, a `NaN`, or a key we have since renamed falls back rather than
 * poisoning the ordering — the stored blob is user-editable in devtools and survives
 * refactors of `ChooserWeights`.
 */
function parseSettings(raw: string | null, viewId: ChooserViewId): ChooserSettings {
  const base = defaultSettings(viewId);
  if (!raw) return base;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof parsed !== "object" || parsed === null) return base;

  const stored = parsed as Record<string, unknown>;
  const weights: ChooserWeights = { ...base.weights };

  if (typeof stored.weights === "object" && stored.weights !== null) {
    const storedWeights = stored.weights as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof ChooserWeights)[]) {
      const value = storedWeights[key];
      if (typeof value === "number" && Number.isFinite(value)) weights[key] = value;
    }
  }

  return {
    weights,
    onlyNextAction: bool(stored.onlyNextAction, base.onlyNextAction),
    useTaskPriorityOrder: bool(stored.useTaskPriorityOrder, base.useTaskPriorityOrder),
    includeDeferred: bool(stored.includeDeferred, base.includeDeferred),
  };
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function useChooserSettings(viewId: ChooserViewId) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(viewId),
    () => null,
  );

  const settings = useMemo(() => parseSettings(raw, viewId), [raw, viewId]);

  const write = useCallback(
    (next: ChooserSettings) => {
      try {
        window.localStorage.setItem(storageKey(viewId), JSON.stringify(next));
      } catch {
        // Quota or private mode — settings just do not persist past this session.
      }
      emit();
    },
    [viewId],
  );

  /** Patch the current view's settings. Weights merge; the flags replace. */
  const update = useCallback(
    (
      patch: Partial<Omit<ChooserSettings, "weights">> & {
        weights?: Partial<ChooserWeights>;
      },
    ) => {
      write({
        ...settings,
        ...patch,
        weights: { ...settings.weights, ...patch.weights },
      });
    },
    [settings, write],
  );

  /** Back to this view's defaults, leaving every other view alone. */
  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey(viewId));
    } catch {
      // Nothing stored to clear.
    }
    emit();
  }, [viewId]);

  return { settings, update, reset };
}
