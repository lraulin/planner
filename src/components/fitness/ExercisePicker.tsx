"use client";

import { TypeaheadSelect } from "@/components/detail/TypeaheadSelect";
import {
  exerciseOptionLabel,
  matchExercises,
  resolveExerciseQuery,
} from "@/lib/fitness/exerciseMatch";
import type { ExerciseSummary } from "@/lib/fitness/types";

/**
 * Type-to-filter catalog picker. Replaces a `<select>` once the list is long
 * enough that scrolling it is slower than typing "bench".
 *
 * A typed name that does not match does not create a row — that still goes
 * through ExerciseEditor, because equipment has to be chosen. Escape closes
 * the list without closing the session drawer (window-capture, before Drawer's
 * document-capture listener).
 */
export function ExercisePicker({
  catalog,
  value,
  onChange,
  onCreateNew,
  allowEmpty = true,
  emptyLabel = "Select exercise…",
  placeholder,
  id,
}: {
  catalog: readonly ExerciseSummary[];
  value: string;
  onChange: (exerciseId: string) => void;
  /** Opens the catalog editor. Receives the typed name when it is a draft. */
  onCreateNew?: (typedName: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  return (
    <TypeaheadSelect
      items={catalog}
      // The fitness forms hold "no exercise" as an empty id.
      value={value || null}
      onChange={(exerciseId) => onChange(exerciseId ?? "")}
      labelOf={exerciseOptionLabel}
      match={matchExercises}
      resolve={resolveExerciseQuery}
      allowEmpty={allowEmpty}
      emptyLabel={emptyLabel}
      placeholder={placeholder}
      id={id}
      create={
        onCreateNew
          ? {
              label: (typed) => (typed ? `Add “${typed}”…` : "Add new exercise…"),
              onCreate: onCreateNew,
            }
          : undefined
      }
    />
  );
}
