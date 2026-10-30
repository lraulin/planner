"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * How every Budget write reports back: one transition for the whole page, so any write in
 * flight disables the controls that could race it, one error line, and a refresh on success.
 */
export function useBudgetRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  return { pending, startTransition, error, setError, run };
}

export type BudgetRun = ReturnType<typeof useBudgetRun>["run"];
