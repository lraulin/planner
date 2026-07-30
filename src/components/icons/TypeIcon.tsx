import type { NodeKind } from "@/lib/tree/hierarchy";

/**
 * One glyph per node kind, carrying the same idea as Achieve's icon column without its
 * Windows-XP gloss: Achieve draws a checked globe for a result area, a folder-and-clock
 * stack for a project, and a clipboard with a red tick for a task. These are the same
 * concepts as line art — a compass, a target, a scheduled plan, a clipboard — at a single
 * stroke weight so a column of them reads as one set.
 *
 * Two of them deliberately differ from Achieve's:
 *
 * - The result area is a compass, not a globe. A globe and the goal's target are both a
 *   plain ring at row size; the needle tells them apart at a glance.
 * - The project keeps the document and the clock from Achieve's folder-doc-clock stack but
 *   drops the folder. A folder says "container", and a result area is the more container-
 *   like of the two — what marks a project is that it is planned work with a schedule.
 *
 * The fifth glyph is the one the database does not have: a Dream is a Goal with a box
 * ticked, and everywhere else it behaves as one, but a yellow star is what makes it findable
 * in a column of targets. It is the reason the icon takes a kind rather than a type.
 *
 * Each kind gets its own hue, which is what actually made Achieve's icons legible: at row
 * size the silhouettes are four small rings and rectangles, and the colour is what you
 * recognise before you have read the shape. This costs nothing now that the indent rails
 * are plain rules — priority is stated once, in the Pri column.
 */
const KIND_COLOR: Record<NodeKind, string> = {
  result_area: "text-type-result-area",
  goal: "text-type-goal",
  dream: "text-type-dream",
  project: "text-type-project",
  task: "text-type-task",
};

const PATHS: Record<NodeKind, React.ReactNode> = {
  /* A compass: a result area is a direction you hold to, not a thing to finish. */
  result_area: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5z" />
    </>
  ),

  /* A target: the outcome you are aiming at. */
  goal: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="3.75" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),

  /* A star: the one you wish for. Same weight as the rest; the hue does the shouting. */
  dream: (
    <path d="M12 3.6l2.58 5.23 5.77.84-4.17 4.07.98 5.75L12 16.77l-5.16 2.72.98-5.75-4.17-4.07 5.77-.84z" />
  ),

  /* A plan with a schedule on it: a project is work that runs against time. */
  project: (
    <>
      <path d="M17.25 12.4V8.1L12.9 3.75H6.6A1.5 1.5 0 0 0 5.1 5.25v13.5a1.5 1.5 0 0 0 1.5 1.5h5.1" />
      <path d="M12.6 3.9v3.4a1 1 0 0 0 1 1h3.4" />
      <path d="M8.1 11.5h5" />
      <path d="M8.1 14.6h3.2" />
      <circle cx="17.1" cy="17.1" r="4.6" />
      <path d="M17.1 14.7v2.5l1.7 1" />
    </>
  ),

  /* A ticked clipboard: the one type you actually check off. */
  task: (
    <>
      <path d="M9.25 4.75H7.5A1.5 1.5 0 0 0 6 6.25v12.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V6.25a1.5 1.5 0 0 0-1.5-1.5h-1.75" />
      <rect x="9.25" y="3" width="5.5" height="3.5" rx="1" />
      <path d="M9.5 13.25l2 2 3.25-3.75" />
    </>
  ),
};

export function TypeIcon({
  kind,
  className = "",
  /** Set false where the icon sits on coloured chrome and should inherit its ink. */
  colored = true,
}: {
  kind: NodeKind;
  className?: string;
  colored?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // The row and the drawer header both already name the type in text, so the glyph is
      // decoration rather than a second announcement.
      aria-hidden
      focusable="false"
      className={[colored ? KIND_COLOR[kind] : "", className].join(" ").trim()}
    >
      {PATHS[kind]}
    </svg>
  );
}
