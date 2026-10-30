"use client";

import { useRouter } from "next/navigation";

import { fileWaitingChargesAction } from "@/app/(shell)/finances/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { PayeeMergeDialog } from "@/components/finances/payees/PayeeMergeDialog";
import { useToast } from "@/components/shell/ToastProvider";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import type { PayeeEvidence } from "./usePayeeEvidence";
import type { BudgetRun } from "./useBudgetRun";

/** Merge the ticked payees, or file one payee's waiting charges into the selected envelope. */
export function PayeeEvidenceDialogs({
  evidence,
  envelope,
  run,
}: {
  evidence: PayeeEvidence;
  /** The envelope the inspector is showing; filing has nowhere to go without one. */
  envelope: BudgetRow | null;
  run: BudgetRun;
}) {
  const router = useRouter();
  const toast = useToast();
  const { mergingPayees, filing } = evidence;

  return (
    <>
      {mergingPayees ? (
        <PayeeMergeDialog
          payees={mergingPayees}
          onClose={evidence.closeMerge}
          onMerged={(message) => {
            evidence.finishMerge();
            toast.success(message);
            router.refresh();
          }}
        />
      ) : null}
      {filing && envelope ? (
        <ConfirmDialog
          open
          title="File the waiting charges?"
          message={`File ${filing.unfiledCount.toLocaleString()} waiting ${filing.name} ${
            filing.unfiledCount === 1 ? "charge" : "charges"
          } into ${envelope.name}? Charges already in another envelope are left alone.`}
          confirmLabel={`File ${filing.unfiledCount.toLocaleString()}`}
          onCancel={evidence.closeFiling}
          onConfirm={() => {
            const entry = filing;
            evidence.closeFiling();
            run(async () => {
              const result = await fileWaitingChargesAction(entry.payeeId, envelope.id);
              if (result.ok) {
                toast.success(
                  `${result.data?.filed.toLocaleString() ?? 0} ${entry.name} charges filed into ${envelope.name}.`,
                );
                evidence.refreshEvidence();
              }
              return result;
            });
          }}
        />
      ) : null}
    </>
  );
}
