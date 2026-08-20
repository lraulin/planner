import { effectiveUnilateral, usesWeight } from "./equipment";
import { tracksReps, tracksTime } from "./measure";
import type { ExerciseEquipment, ExerciseMeasure } from "./types";

/**
 * Which fields a set row shows, derived from the catalog exercise rather than branched
 * on in the editor. Equipment, unilateral and measure are three independent axes; written
 * as nested conditionals in the component they multiply out to a dozen near-identical
 * grids, which is how the widths drifted apart before.
 */

export type SetColumnKey =
  | "index"
  | "reps"
  | "repsLeft"
  | "repsRight"
  | "duration"
  | "weight"
  | "unit"
  | "delete";

export type SetColumn = {
  key: SetColumnKey;
  /** Header text; blank for the ordinal and delete gutters. */
  label: string;
  /** One `grid-template-columns` track. */
  width: string;
};

export type SetShape = {
  measure: ExerciseMeasure;
  equipment: ExerciseEquipment;
  unilateral: boolean;
};

const INDEX: SetColumn = { key: "index", label: "#", width: "2rem" };
const DELETE: SetColumn = { key: "delete", label: "", width: "2rem" };
const UNIT: SetColumn = { key: "unit", label: "Unit", width: "3.5rem" };

export function setColumns(shape: SetShape): SetColumn[] {
  const uni = effectiveUnilateral(shape.equipment, shape.unilateral);
  const showWeight = usesWeight(shape.equipment);
  const showReps = tracksReps(shape.measure);
  const showDuration = tracksTime(shape.measure);

  const columns: SetColumn[] = [INDEX];

  // Narrow tracks once anything else competes for the row, wide when reps are alone.
  const crowded = showWeight || showDuration;

  if (showReps) {
    if (uni) {
      const width = crowded ? "minmax(2.5rem,0.7fr)" : "1fr";
      columns.push(
        { key: "repsLeft", label: "L", width },
        { key: "repsRight", label: "R", width },
      );
    } else {
      columns.push({
        key: "reps",
        label: "Reps",
        width: crowded ? "minmax(3rem,1fr)" : "1fr",
      });
    }
  }

  if (showDuration) {
    columns.push({
      key: "duration",
      // Beside reps it is the hold at the end of the set; alone it is the whole set.
      label: showReps ? "Hold" : "Time",
      width: showWeight ? "minmax(3.5rem,1fr)" : "1fr",
    });
  }

  if (showWeight) {
    columns.push({
      key: "weight",
      label: "Weight",
      width: showDuration || uni ? "minmax(6.5rem,1.3fr)" : "minmax(7rem,1.4fr)",
    });
    columns.push(UNIT);
  }

  columns.push(DELETE);
  return columns;
}

export function gridTemplate(columns: SetColumn[]): string {
  return columns.map((c) => c.width).join(" ");
}
