"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  clearPayeeRoutingAction,
  payeeEvidenceAction,
} from "@/app/(shell)/finances/actions";
import type { PayeeEvidenceRow } from "@/lib/finances/payees/evidence";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import type { BudgetRun } from "./useBudgetRun";

/**
 * The inspector's Files-here list for the selected envelope, the payees ticked in it, and
 * the merge and file-waiting flows started from it.
 */
export function usePayeeEvidence(selectedRow: BudgetRow | null, run: BudgetRun) {
  const [, startEvidenceLoad] = useTransition();
  // Both are stamped with the envelope they belong to, so selecting another row shows an
  // empty list immediately rather than last envelope's payees until the read comes back.
  const [evidenceState, setEvidenceState] = useState<{
    categoryId: string;
    rows: readonly PayeeEvidenceRow[];
  } | null>(null);
  const [selectedPayees, setSelectedPayees] = useState<{
    categoryId: string;
    ids: readonly string[];
  } | null>(null);
  const [mergingPayees, setMergingPayees] = useState<
    readonly { id: string; name: string }[] | null
  >(null);
  const [filing, setFiling] = useState<PayeeEvidenceRow | null>(null);

  const selectedId = selectedRow?.id ?? null;
  const showsEvidence = Boolean(selectedRow && !selectedRow.isIncome);
  const evidence =
    evidenceState && evidenceState.categoryId === selectedId
      ? evidenceState.rows
      : null;
  const evidenceSelection =
    selectedPayees && selectedPayees.categoryId === selectedId
      ? selectedPayees.ids
      : [];

  /**
   * Read the Files-here list for whichever envelope is selected.
   *
   * Per selection rather than with the page: the answer needs every charge of every payee
   * that files here, which is thousands of rows for Amazon and nothing at all for most
   * envelopes. A read for an envelope the user has already left is dropped on arrival.
   */
  const loadEvidence = useCallback(
    (categoryId: string) => {
      startEvidenceLoad(async () => {
        const result = await payeeEvidenceAction(categoryId);
        setEvidenceState({ categoryId, rows: result.ok ? result.data : [] });
      });
    },
    [startEvidenceLoad],
  );

  useEffect(() => {
    if (!selectedId || !showsEvidence) return;
    loadEvidence(selectedId);
  }, [selectedId, showsEvidence, loadEvidence]);

  /** After a Remove, a merge, or a filing run, the counts on screen are stale. */
  const refreshEvidence = useCallback(() => {
    if (!selectedId) return;
    loadEvidence(selectedId);
  }, [selectedId, loadEvidence]);

  return {
    evidence,
    selectedPayeeIds: evidenceSelection,
    mergingPayees,
    filing,
    refreshEvidence,
    togglePayee(payeeId: string) {
      if (!selectedId) return;
      setSelectedPayees({
        categoryId: selectedId,
        ids: evidenceSelection.includes(payeeId)
          ? evidenceSelection.filter((id) => id !== payeeId)
          : [...evidenceSelection, payeeId],
      });
    },
    startMerge() {
      const picked = (evidence ?? []).filter((entry) =>
        evidenceSelection.includes(entry.payeeId),
      );
      if (picked.length < 2) return;
      setMergingPayees(
        picked.map((entry) => ({ id: entry.payeeId, name: entry.name })),
      );
    },
    closeMerge: () => setMergingPayees(null),
    /** The merged payees are gone, so the ticks pointing at them go too. */
    finishMerge() {
      setMergingPayees(null);
      setSelectedPayees(null);
      refreshEvidence();
    },
    removeRouting(entry: PayeeEvidenceRow) {
      run(async () => {
        const result = await clearPayeeRoutingAction(entry.payeeId);
        if (result.ok) refreshEvidence();
        return result;
      });
    },
    startFiling: (entry: PayeeEvidenceRow) => setFiling(entry),
    closeFiling: () => setFiling(null),
  };
}

export type PayeeEvidence = ReturnType<typeof usePayeeEvidence>;
