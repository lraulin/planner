"use client";

import { useCallback, useMemo } from "react";
import { useSetting, type SettingCodec } from "@/components/settings/SettingsProvider";
import { parseChooserSettings, serializeChooserSettings } from "@/lib/chooser/settings";
import { chooserScope } from "@/lib/settings/scopes";
import type { ChooserWeights } from "@/lib/chooser/score";
import type { ChooserSettings, ChooserViewId } from "@/lib/chooser/types";

/**
 * Task Chooser settings, persisted **per view** — Achieve keeps separate scoring settings
 * for each view, and so do we. From the user manual (§8.1.4):
 *
 * > You can adjust the settings used to score items in the current view. When you change
 * > settings, the new settings will only apply to items in the current view. Other views will
 * > retain their own unique settings.
 *
 * These lived in `localStorage` until the settings rail landed. They now follow the user
 * between browsers like the rest of their preferences; the parsing that used to sit here
 * moved to `src/lib/chooser/settings.ts`, where it is testable without a hook.
 *
 * **A saved view gets its own weights for free**, which is why saved views cost the Chooser no
 * new storage design: `chooserScope` takes whatever view id is selected, and a saved id is a
 * legal scope key. Only the *defaults* need a built-in, which is what `base` is for.
 */

/** Per base view, because the codec closes over which view's defaults to fall back to. */
function codecFor(baseViewId: ChooserViewId): SettingCodec<ChooserSettings> {
  return {
    parse: (raw) => parseChooserSettings(raw, baseViewId),
    serialize: serializeChooserSettings,
  };
}

export function useChooserSettings(
  /** The extras row to read — the working set (`working`), not the origin view. */
  viewId: string,
  /** The built-in it derives from. Decides what those settings **default to**. */
  base: ChooserViewId,
) {
  // Memoised on the base id: `useSetting` re-parses whenever the codec identity changes.
  const codec = useMemo(() => codecFor(base), [base]);
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
