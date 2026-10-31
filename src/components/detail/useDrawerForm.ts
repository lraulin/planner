"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actionResult";

/**
 * An explicit-save drawer form, with the save rules of `drawer-pattern.md`: Save persists and
 * stays open showing "Saved"; Save & Close persists and leaves; a failed write never closes,
 * it stays open with the error; the next edit clears "Saved". Saving a clean form writes
 * nothing.
 *
 * Spread `footer` into `DrawerFooter` and pass `dirty` to `DrawerLeaveGuard`.
 */
export function useDrawerForm<TDraft>({
  initial,
  persist,
  onChanged,
  onClose,
}: {
  initial: () => TDraft;
  persist: (draft: TDraft) => Promise<ActionResult>;
  /** The record changed — re-read whatever lists it. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function patch<K extends keyof TDraft>(key: K, value: TDraft[K]) {
    setJustSaved(false);
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(thenClose: boolean) {
    setError(null);
    startTransition(async () => {
      if (dirty) {
        const result = await persist(draft);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDirty(false);
        onChanged();
      }
      if (thenClose) onClose();
      else setJustSaved(true);
    });
  }

  return {
    draft,
    patch,
    dirty,
    footer: {
      onSave: () => save(false),
      onSaveAndClose: () => save(true),
      onClose,
      saving,
      dirty,
      justSaved,
      error,
    },
  };
}
