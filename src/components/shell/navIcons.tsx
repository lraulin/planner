/**
 * The navigation glyphs — one per view for the collapsed sidebar rail, plus the phone
 * bottom nav's and the shell's own chrome.
 *
 * A collapsed rail is icons *only*, so these are the entire label for a view at 48px. Each
 * one is drawn to be distinguishable at a glance from the others in its section rather
 * than to be individually clever — `title` carries the name for anyone unsure.
 *
 * The shared preset lives in `@/components/icons/glyph`, so the command glyphs beside them in a
 * menu gutter cannot end up a different stroke weight. Command verbs go in `commandIcons.tsx`;
 * this file is views and shell chrome.
 */
import { GLYPH as BASE } from "@/components/icons/glyph";

/** Inbox processing: a tray whose one current item is ready to be classified. */
export function OrganizeIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.25 10.5 5 4h10l1.75 6.5v5.25a1.5 1.5 0 0 1-1.5 1.5H4.75a1.5 1.5 0 0 1-1.5-1.5Z" />
      <path d="M3.5 10.5h4l1.25 2h2.5l1.25-2h4" />
      <path d="m8 7 1.35 1.35L12.5 5.2" />
    </svg>
  );
}

export function TasksIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M7.75 5.5h9.5M7.75 10h9.5M7.75 14.5h9.5" />
      <path d="M2.75 5.5h1.5M2.75 10h1.5M2.75 14.5h1.5" />
    </svg>
  );
}

export function CaptureIcon() {
  return (
    <svg {...BASE} className="h-5 w-5" strokeWidth={1.75}>
      <path d="M10 4.75v10.5M4.75 10h10.5" />
    </svg>
  );
}

export function NotesIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M4.75 3.25h7l4 4v9.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V4.25a1 1 0 0 1 1-1Z" />
      <path d="M11.5 3.5v4h4" />
      <path d="M7.5 11.5h5M7.5 14h3" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="4.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Plan: a tree, because the module *is* the outline — Overview, Outline, Projects, Tasks,
 * Goals, Wish List and Result Areas are one hierarchy drawn seven ways.
 *
 * This was `OutlineIcon` while those seven were seven sidebar rows with a glyph each. The
 * other six are gone rather than parked: a page bar is text, so nothing renders them, and git
 * has them if a future module wants a target or a star.
 */
export function PlanIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.25 4.5h4M6 4.5v9.5h3.5M6 9.25h3.5" />
      <path d="M11.25 3h5.5M11.25 9.25h5.5M11.25 15.5h5.5" />
    </svg>
  );
}

/** Task Chooser: a ranked, scored shortlist — three bars, tallest first. */
export function ChooserIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.25 5h11M3.25 10h7.5M3.25 15h4" />
      <path d="m15.5 12.5 1.75 1.75L15.5 16" />
    </svg>
  );
}

/** Weekly Schedule: a week grid, not the Day tab's single dated page. */
export function ScheduleIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <rect x="2.75" y="4" width="14.5" height="13.25" rx="2" />
      <path d="M2.75 8h14.5M6.5 2.75v2.5M13.5 2.75v2.5" />
      <path d="M7.5 8v9.25M12.5 8v9.25" />
    </svg>
  );
}

/** Metrics: a trend line over axes. */
export function MetricsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.25 3.25v13.5h13.5" />
      <path d="m6 13 3-3.75 2.75 2L16 5.75" />
    </svg>
  );
}

/** Fitness: a dumbbell. */
export function FitnessIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M4.5 7.25v5.5M2.75 8.5v3M15.5 7.25v5.5M17.25 8.5v3" />
      <path d="M4.5 10h11" />
    </svg>
  );
}

/** Finances: a banknote. Money as a thing you hold, not a chart of it. */
export function FinancesIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <rect x="2.75" y="5.25" width="14.5" height="9.5" rx="1.25" />
      <circle cx="10" cy="10" r="2" />
      <path d="M5.5 10h.01M14.5 10h.01" />
    </svg>
  );
}

/**
 * Library: books on a shelf — reference you keep and consult, not a place you work.
 *
 * Shelved volumes rather than Contacts' person or Resources' capacity blocks, because the
 * module holds both of those and a glyph for either half would misname the whole.
 */
export function LibraryIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.5 3.75h3v12.5h-3ZM7.75 3.75h3v12.5h-3Z" />
      <path d="m12.25 4.75 2.9-.78 2.6 11.6-2.9.78Z" />
      <path d="M2.75 17.25h14.5" />
    </svg>
  );
}

/** Settings, pinned below the sections — chrome, not a view. */
export function SettingsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.75v2M10 15.25v2M17.25 10h-2M4.75 10h-2M15.13 4.87l-1.41 1.41M6.28 13.72l-1.41 1.41M15.13 15.13l-1.41-1.41M6.28 6.28 4.87 4.87" />
    </svg>
  );
}

const CHEVRON_ROTATION = {
  left: "",
  right: "rotate-180",
  up: "rotate-90",
  down: "-rotate-90",
} as const;

/**
 * The sidebar's collapse toggle, and the Commands panel's section headers. One glyph rotated
 * rather than four paths: all four states are the same chevron pointing a different way, and
 * drawing them separately is how they drift apart.
 */
export function ChevronIcon({
  pointing,
  className = "h-4 w-4",
}: {
  pointing: keyof typeof CHEVRON_ROTATION;
  className?: string;
}) {
  return (
    <svg {...BASE} className={`${className} ${CHEVRON_ROTATION[pointing]}`}>
      <path d="m12 5-5 5 5 5" />
    </svg>
  );
}
