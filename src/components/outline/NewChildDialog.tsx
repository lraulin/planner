"use client";

import { useEffect, useId, useRef } from "react";
import { KIND_HINTS, KIND_LABELS, type NodeKind } from "@/lib/tree/hierarchy";
import { TypeIcon } from "@/components/icons/TypeIcon";
import { ModalShell } from "@/components/detail/ModalShell";

/**
 * Which kind of row a new child should be.
 *
 * `ux-principles.md` keeps modals rare, and this is the second case it allows: a blocking
 * decision the app cannot make for you. Guessing is worse than asking here — a child of a
 * result area is as likely to be a goal as a project, and a row created as the wrong type
 * cannot be converted, only deleted and retyped.
 *
 * It is asked only when there is something to ask. Under a task the answer can only be
 * Task, and `OutlineGrid` skips straight to creating one.
 *
 * The default kind takes focus, so Return accepts it and the dialog costs one keystroke to
 * anyone who wanted what they would have got before. Digits pick directly, which is the
 * habit Achieve's own dialogs built.
 */
export function NewChildDialog({
  open,
  parentName,
  kinds,
  defaultKind,
  onPick,
  onCancel,
}: {
  open: boolean;
  /** Named so the dialog says what you are adding to, not just what you are adding. */
  parentName: string;
  kinds: NodeKind[];
  defaultKind: NodeKind;
  onPick: (kind: NodeKind) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const defaultRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // `ModalShell` focuses the first control in the panel; this runs after it (a parent's
    // effect follows its children's) and moves focus to the default instead.
    defaultRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= kinds.length) return;
      event.preventDefault();
      onPick(kinds[index]);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, kinds, onPick]);

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      labelledBy={titleId}
      width="max-w-sm"
      panelRef={panelRef}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Add to {parentName || "this row"}
        </h2>

        <div className="mt-3 flex flex-col gap-1">
          {kinds.map((kind, index) => (
            <button
              key={kind}
              type="button"
              ref={kind === defaultKind ? defaultRef : undefined}
              onClick={() => onPick(kind)}
              className="flex items-start gap-2.5 rounded border border-transparent px-2 py-1.5 text-left transition-colors hover:border-rule hover:bg-surface-raised focus-visible:border-select-edge focus-visible:bg-surface-raised focus-visible:outline-none"
            >
              <TypeIcon kind={kind} className="mt-0.5 h-4 w-4 flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-ink">
                  {KIND_LABELS[kind]}
                </span>
                <span className="block text-[0.8125rem] leading-snug text-ink-muted">
                  {KIND_HINTS[kind]}
                </span>
              </span>
              <span className="tabular mt-0.5 flex-none text-[0.6875rem] text-ink-faint">
                {index + 1}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
