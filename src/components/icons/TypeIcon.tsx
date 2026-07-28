import type { NodeType } from "@/db/schema";

/**
 * One glyph per node type, carrying the same idea as Achieve's icon column without its
 * Windows-XP gloss: Achieve draws a checked globe for a result area, a folder-and-clock
 * stack for a project, and a clipboard with a red tick for a task. These are the same
 * concepts as line art — a globe, a target, a folder, a clipboard — at a single stroke
 * weight so a column of them reads as one set.
 *
 * They are drawn in `currentColor` and stay monochrome on purpose. Colour in the outline
 * means priority (the spine, the priority cell); a second colour system arguing with it
 * would cost more than the icons are worth.
 */
const PATHS: Record<NodeType, React.ReactNode> = {
  /* A globe: a result area is a dimension of life, not a thing to finish. */
  result_area: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M3.75 12h16.5" />
      <path d="M12 3.75a12.5 12.5 0 0 1 0 16.5a12.5 12.5 0 0 1 0-16.5Z" />
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

  /* A folder: the container that holds the work. */
  project: (
    <path d="M3.75 7.5A1.5 1.5 0 0 1 5.25 6h3.9a1.5 1.5 0 0 1 1.2.6l1.05 1.4h7.35a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5Z" />
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
