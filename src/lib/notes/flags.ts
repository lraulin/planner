import type { NoteFlag } from "@/db/schema";

/**
 * Achieve's note flags. Eight are pure colours with no meaning attached — that is the
 * point of them; the meaning is whatever the user decides this week — plus `done`, its one
 * semantic entry, and `none`. These labels are shared by cells, filters, and groups.
 */
export const FLAG_LABELS: Record<NoteFlag, string> = {
  none: "None",
  done: "Done",
  blue: "Blue",
  cyan: "Cyan",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
  red: "Red",
  yellow: "Yellow",
};

/** Achieve's one-letter flag codes. */
export const FLAG_CODES: Record<NoteFlag, string> = {
  none: "",
  done: "D",
  blue: "B",
  cyan: "C",
  green: "G",
  orange: "O",
  purple: "P",
  red: "R",
  yellow: "Y",
};
