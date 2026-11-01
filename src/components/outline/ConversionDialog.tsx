"use client";

import { useId } from "react";
import { KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";
import type { ConversionPlan } from "@/lib/tree/conversion";
import { ModalShell } from "@/components/detail/ModalShell";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { DialogActions } from "@/components/detail/DialogActions";

export function ConversionDialog({
  nodeName,
  targetKind,
  plan,
  open,
  onConfirm,
  onCancel,
}: {
  nodeName: string;
  targetKind: NodeKind;
  plan: ConversionPlan | null;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const blocked = !plan || plan.descendantConflicts.length > 0;

  return (
    <ModalShell open={open} onClose={onCancel} labelledBy={titleId} width="max-w-lg">
      <div className="p-5">
        <div className="flex items-center gap-2">
          <TypeIcon kind={targetKind} className="h-4 w-4" />
          <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
            Convert “{nodeName || "Untitled item"}” to {KIND_LABELS[targetKind]}
          </h2>
        </div>

        {!plan ? (
          <p className="mt-4 text-[0.8125rem] text-ink-muted">
            Preparing conversion preview…
          </p>
        ) : (
          <>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
              The item keeps its id, name, priority, deadline and target dates, focus,
              and notes.
            </p>

            {plan.lifecycleChange && (
              <div className="mt-3 border-l-2 border-select-edge bg-select/40 px-3 py-2 text-[0.8125rem] text-ink">
                {plan.lifecycleChange}
              </div>
            )}

            {plan.placement.hoisted && (
              <div className="mt-3 border-l-2 border-select-edge bg-select/40 px-3 py-2 text-[0.8125rem] text-ink">
                Destination: <strong>{plan.placement.destinationLabel}</strong>. The
                item will be placed beside its former branch to keep it near the work it
                came from.
              </div>
            )}

            {plan.discardedFields.length > 0 && (
              <div className="mt-3 border-l-2 border-priority-a bg-priority-a/10 px-3 py-2">
                <p className="text-[0.8125rem] font-medium text-priority-a">
                  These details will be cleared
                </p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-priority-a/90">
                  {plan.discardedFields.join(" · ")}
                </p>
              </div>
            )}

            {plan.descendantConflicts.length > 0 && (
              <div className="mt-3 border-l-2 border-priority-a bg-priority-a/10 px-3 py-2">
                <p className="text-[0.8125rem] font-medium text-priority-a">
                  Conversion blocked by direct children
                </p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-priority-a/90">
                  {plan.descendantConflicts.map((child) => child.name).join(", ")}.
                  Convert or move these children first.
                </p>
              </div>
            )}
          </>
        )}

        <DialogActions
          confirmLabel="Convert"
          onConfirm={onConfirm}
          onCancel={onCancel}
          disabled={blocked}
        />
      </div>
    </ModalShell>
  );
}
