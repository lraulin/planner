import type { AppointmentCheck } from "@/db/schema";

/** Cycle order matching Achieve: empty → check → X → empty. */
export const CHECK_CYCLE: AppointmentCheck[] = ["open", "done", "missed"];

export function nextCheckState(current: AppointmentCheck): AppointmentCheck {
  const i = CHECK_CYCLE.indexOf(current);
  return CHECK_CYCLE[(i + 1) % CHECK_CYCLE.length];
}

/** Glyph drawn in the small square on the event (and in the form). */
export function checkStateMark(state: AppointmentCheck): string {
  switch (state) {
    case "done":
      return "✓";
    case "missed":
      return "✕";
    default:
      return "";
  }
}

export function checkStateLabel(state: AppointmentCheck): string {
  switch (state) {
    case "done":
      return "Done";
    case "missed":
      return "Missed";
    default:
      return "Open";
  }
}

export function isCheckedAppearance(state: AppointmentCheck): boolean {
  return state === "done" || state === "missed";
}
