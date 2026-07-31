"use client";

import { useCallback, useMemo } from "react";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { parseChooserSettings, serializeChooserSettings } from "@/lib/chooser/settings";
import { chooserScope } from "@/lib/settings/scopes";
import type { ChooserWeights } from "@/lib/chooser/score";
import type { ChooserSettings, ChooserViewId } from "@/lib/chooser/types";

/**
 * Task Chooser settings, persisted **per view** — Achieve keeps separate scoring settings
 * for each view, and so do we.
 *
 * These lived in `localStorage` until the settings rail landed. They now follow the user
 * between browsers like the rest of their preferences; the parsing that used to sit here
 * moved to `src/lib/chooser/settings.ts`, where it is testable without a hook.
 */

/** Per view, because the codec closes over which view's defaults to fall back to. */
function codecFor(viewId: ChooserViewId): SettingCodec<ChooserSettings> {
  return {
    parse: (raw) => parseChooserSettings(raw, viewId),
    serialize: serializeChooserSettings,
  };
}

export function useChooserSettings(viewId: ChooserViewId) {
  // Memoised on the view id: `useSetting` re-parses whenever the codec identity changes.
  const codec = useMemo(() => codecFor(viewId), [viewId]);
  const { value: settings, patch, reset } = useSetting(chooserScope(viewId), codec);

  /** Patch the current view's settings. Weights merge; the flags replace. */
  const update = useCallback(
    (
      next: Partial<Omit<ChooserSettings, "weights">> & {
        weights?: Partial<ChooserWeights>;
      },
    ) => {
      patch((current) => ({
        ...current,
        ...next,
        weights: { ...current.weights, ...next.weights },
      }));
    },
    [patch],
  );

  return { settings, update, reset };
}
