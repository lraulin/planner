"use client";

import type {
  GoalDetails,
  NodeItemKind,
  ProjectDetails,
  ResultAreaDetails,
  TaskDetails,
} from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { NodeDetail, NodeDetailValues } from "@/lib/detail/types";
import { FieldGrid, PriorityField, SelectField, TextField } from "./fields";

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
  patchGoal: (changes: Partial<GoalDetails>) => void;
  patchProject: (changes: Partial<ProjectDetails>) => void;
  patchTask: (changes: Partial<TaskDetails>) => void;
  /** Renders a fully wired repeating list for one kind. */
  list: (kind: NodeItemKind) => React.ReactNode;
  /**
   * Runs a server action that writes on its own and re-reads the record afterwards, for
   * the few commands that are not part of the draft — Skip Recurrence, so far.
   */
  runAction: (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
  ) => void;
  busy: boolean;
  /**
   * Category names for the Result Area combobox (defaults plus any already in use).
   * Empty when the drawer has no outline context; the form still offers Personal / Work.
   */
  categories: string[];
  /** Result Areas this user can file this record under. */
  resultAreas: { id: string; name: string }[];
};

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

/**
 * Achieve's Result Area dropdown on Goal and Project forms. Changing it reparents the
 * row under that area; leaving it alone does not touch the immediate parent.
 */
export function ResultAreaField({
  value,
  resultAreas,
  onChange,
}: {
  value: string | null;
  resultAreas: readonly { id: string; name: string }[];
  onChange: (resultAreaId: string | null) => void;
}) {
  const options = resultAreas.map((area) => ({
    value: area.id,
    label: area.name || "(unnamed)",
  }));
  // A stored owner that is no longer in the list must stay selectable so the next save
  // does not silently clear it.
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: "(missing Result Area)" });
  }
  return (
    <SelectField
      label="Result Area"
      value={value}
      options={options}
      onChange={onChange}
      allowEmpty
    />
  );
}
