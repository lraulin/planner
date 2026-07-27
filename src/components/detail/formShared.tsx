"use client";

import type {
  NodeItemKind,
  NodeState,
  ProjectDetails,
  ResultAreaDetails,
  TaskDetails,
} from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { NodeDetail, NodeDetailValues } from "@/lib/detail/types";
import {
  CheckboxField,
  DateField,
  FieldGrid,
  PriorityField,
  TextField,
} from "./fields";

/**
 * What every detail form is handed. The drawer owns the draft and the item wiring; a form
 * is just a declaration of which fields go on which tab.
 */
export type DetailFormProps = {
  detail: NodeDetail;
  /** The row the drawer was opened from, which already carries the subtree rollups. */
  node: OutlineNode;
  values: NodeDetailValues;
  patch: (changes: Partial<NodeDetailValues>) => void;
  patchResultArea: (changes: Partial<ResultAreaDetails>) => void;
  patchProject: (changes: Partial<ProjectDetails>) => void;
  patchTask: (changes: Partial<TaskDetails>) => void;
  /** Renders a fully wired repeating list for one kind. */
  list: (kind: NodeItemKind) => React.ReactNode;
  busy: boolean;
};

export const STATE_OPTIONS: { value: NodeState; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Name, priority, and focus — the fields every type shares, at the top of every General tab.
 *
 * These are also grid columns, and `ux-principles.md` says grid columns are edited inline.
 * They appear here anyway because the drawer is the *record*, and a form that omitted the
 * name would be strange; the grid remains the fast path.
 */
export function CoreHeaderFields({
  values,
  patch,
}: Pick<DetailFormProps, "values" | "patch">) {
  return (
    <FieldGrid columns={3}>
      <TextField
        label="Name"
        value={values.name}
        onChange={(name) => patch({ name })}
        className="sm:col-span-2"
      />
      <PriorityField
        letter={values.priorityLetter}
        rank={values.priorityRank}
        onChange={(priorityLetter, priorityRank) =>
          patch({ priorityLetter, priorityRank })
        }
      />
    </FieldGrid>
  );
}

/** Deadline and focus, which every type also shares. */
export function CoreScheduleFields({
  values,
  patch,
}: Pick<DetailFormProps, "values" | "patch">) {
  return (
    <>
      <DateField
        label="Deadline"
        value={values.deadline}
        onChange={(deadline) => patch({ deadline })}
      />
      <CheckboxField
        label="Focus"
        checked={values.focus}
        onChange={(focus) => patch({ focus })}
        hint="Shows in the outline's focus-only view."
        className="self-end pb-2"
      />
    </>
  );
}
