"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { ProjectPickerDialog } from "./ProjectPickerDialog";
import type { ProjectPickerValue } from "./ProjectPicker";

export function ProjectScopePicker({
  nodes,
  scopeId,
  onChange,
}: {
  nodes: readonly OutlineNode[];
  scopeId: string;
  onChange: (scopeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const value: ProjectPickerValue = scopeId
    ? scopeId === "__none__"
      ? { kind: "none" }
      : { kind: "project", projectId: scopeId }
    : { kind: "all" };
  const label = useMemo(() => {
    if (!scopeId) return "All Projects";
    if (scopeId === "__none__") return "No Project";
    return nodes.find((node) => node.id === scopeId)?.name || "Choose project";
  }, [nodes, scopeId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Choose project scope"
        className="flex min-h-tap max-w-56 items-center gap-2 rounded border border-rule bg-surface px-2 text-[0.75rem] text-ink hover:border-rule-strong hover:bg-surface-raised md:h-7 md:min-h-0"
      >
        <span className="text-ink-faint">Project</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <span aria-hidden className="text-[0.625rem] text-ink-faint">
          ▾
        </span>
      </button>
      <ProjectPickerDialog
        open={open}
        nodes={nodes}
        value={value}
        allowAll
        allowNone
        onCancel={() => setOpen(false)}
        onConfirm={(next) => {
          setOpen(false);
          onChange(
            next.kind === "all"
              ? ""
              : next.kind === "none"
                ? "__none__"
                : next.projectId,
          );
        }}
      />
    </>
  );
}
