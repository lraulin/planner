"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import type { OutlineNode } from "@/lib/tree/types";
import { ProjectPicker, type ProjectPickerValue } from "./ProjectPicker";

export function ProjectPickerDialog({
  open,
  nodes,
  value,
  onConfirm,
  onCancel,
  allowAll = false,
  allowNone = false,
  title = "Choose project",
  description = "Choose a project, goal, dream, or result area whose tasks you want to see.",
}: {
  open: boolean;
  nodes: readonly OutlineNode[];
  value: ProjectPickerValue;
  onConfirm: (value: ProjectPickerValue) => void;
  onCancel: () => void;
  allowAll?: boolean;
  allowNone?: boolean;
  title?: string;
  description?: string;
}) {
  if (!open) return null;
  return (
    <OpenProjectPickerDialog
      nodes={nodes}
      value={value}
      onConfirm={onConfirm}
      onCancel={onCancel}
      allowAll={allowAll}
      allowNone={allowNone}
      title={title}
      description={description}
    />
  );
}

function OpenProjectPickerDialog({
  nodes,
  value,
  onConfirm,
  onCancel,
  allowAll,
  allowNone,
  title,
  description,
}: {
  nodes: readonly OutlineNode[];
  value: ProjectPickerValue;
  onConfirm: (value: ProjectPickerValue) => void;
  onCancel: () => void;
  allowAll: boolean;
  allowNone: boolean;
  title: string;
  description: string;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(value);

  const valid =
    (draft.kind === "node" && Boolean(draft.nodeId)) ||
    (allowAll && draft.kind === "all") ||
    (allowNone && draft.kind === "none");

  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-xl">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">{description}</p>
        <div className="mt-4">
          <ProjectPicker
            nodes={nodes}
            value={draft}
            onChange={setDraft}
            allowAll={allowAll}
            allowNone={allowNone}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => valid && onConfirm(draft)}
            disabled={!valid}
            className="min-h-tap rounded bg-select-edge px-3 text-[0.8125rem] text-white hover:brightness-95 disabled:opacity-40 md:min-h-0 md:py-1.5"
          >
            Choose project
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
