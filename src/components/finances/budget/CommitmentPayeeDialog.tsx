"use client";

import { useId, useState, useTransition } from "react";
import { setCommitmentPayeesAction } from "@/app/(shell)/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import { PayeePickerField } from "@/components/finances/payees/PayeePickerField";
import { FormActions } from "@/components/detail/FormActions";

export function CommitmentPayeeDialog({
  commitment,
  payees,
  onClose,
  onSaved,
}: {
  commitment: {
    id: string;
    name: string;
    payeeIds: readonly string[];
  };
  payees: readonly { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const [selected, setSelected] = useState([...commitment.payeeIds]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-md">
      <form
        className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await setCommitmentPayeesAction({
              id: commitment.id,
              payeeIds: selected,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onSaved();
          });
        }}
      >
        <div>
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            Payees for {commitment.name}
          </h2>
          <p className="mt-1 text-[0.75rem] text-ink-muted">
            Charges from these stable payees belong to this commitment. A commitment may
            have none.
          </p>
        </div>

        <div className="min-h-0 overflow-auto">
          <PayeePickerField payees={payees} value={selected} onChange={setSelected} />
        </div>

        {error ? (
          <p role="alert" className="text-[0.75rem] text-priority-a">
            {error}
          </p>
        ) : null}

        <FormActions submitLabel="Save payees" pending={saving} onCancel={onClose} />
      </form>
    </ModalShell>
  );
}
