import type { NodeType } from "@/db/schema";

/**
 * One glyph per node type, carrying the same idea as Achieve's icon column without its
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
 * They are drawn in `currentColor` and stay monochrome on purpose. Colour in the outline
 * means priority (the spine, the priority cell); a second colour system arguing with it
 * would cost more than the icons are worth.
 */
const PATHS: Record<NodeType, React.ReactNode> = {
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
  type,
  className = "",
}: {
  type: NodeType;
  className?: string;
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
      className={className}
    >
      {PATHS[type]}
    </svg>
  );
}
