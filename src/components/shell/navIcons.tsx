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

/** Overview: the five linked phases of the productivity process. */
export function OverviewIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="4" cy="5" r="1.5" />
      <circle cx="10" cy="3.5" r="1.5" />
      <circle cx="16" cy="5" r="1.5" />
      <circle cx="14" cy="14.5" r="1.5" />
      <circle cx="6" cy="14.5" r="1.5" />
      <path d="m5.5 4.6 3-.7m3 0 3 .7m.9 1.8-.9 6.6m-2 .8-5 0M5.5 13 4.6 6.4" />
    </svg>
  );
}

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

export function DayIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <rect x="2.75" y="4" width="14.5" height="13.25" rx="2" />
      <path d="M2.75 8h14.5M6.5 2.75v2.5M13.5 2.75v2.5" />
      <path d="m7.25 12.25 1.75 1.75 3.75-3.75" />
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

/** The outline: a tree, because that is literally what the view is. */
export function OutlineIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="M3.25 4.5h4M6 4.5v9.5h3.5M6 9.25h3.5" />
      <path d="M11.25 3h5.5M11.25 9.25h5.5M11.25 15.5h5.5" />
    </svg>
  );
}

/** Projects: stacked layers — a project is a container of tasks. */
export function ProjectsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="m10 2.75 6.75 3.5L10 9.75 3.25 6.25Z" />
      <path d="m3.25 10 6.75 3.5L16.75 10" />
      <path d="m3.25 13.75 6.75 3.5 6.75-3.5" />
    </svg>
  );
}

/** Goals: a target. Distinct from Wish List's star at a glance. */
export function GoalsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="10" cy="10" r="7.25" />
      <circle cx="10" cy="10" r="3.75" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Wish List: a star — someday/maybe, not committed to. */
export function WishesIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <path d="m10 2.75 2.28 4.62 5.1.74-3.69 3.6.87 5.08L10 14.39l-4.56 2.4.87-5.08-3.69-3.6 5.1-.74Z" />
    </svg>
  );
}

/**
 * Result Areas: a pie, because an area's Importance is its slice of a fixed hundred. The
 * one glyph in Plan that is about proportion rather than structure.
 */
export function ResultAreasIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 2.75V10l6.4 3.4" />
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

/** Contacts: a person. The only glyph in the app that is a human being. */
export function ContactsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <circle cx="10" cy="6.75" r="3.25" />
      <path d="M3.75 17.25a6.25 6.25 0 0 1 12.5 0" />
    </svg>
  );
}

/** Resources: three joined capacity blocks, rather than a person or a project tree. */
export function ResourcesIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <rect x="3" y="4" width="5" height="5" rx="1" />
      <rect x="12" y="4" width="5" height="5" rx="1" />
      <rect x="7.5" y="12" width="5" height="5" rx="1" />
      <path d="M8 6.5h4M10 9v3" />
    </svg>
  );
}

/**
 * Time Charts: a week's worth of painted blocks. Deliberately unlike `ScheduleIcon`'s empty
 * week grid — a time chart is the week you *intended*, which is why it has fill and the
 * schedule does not.
 */
export function TimeChartsIcon() {
  return (
    <svg {...BASE} className="h-5 w-5">
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="1.5" />
      <path d="M7.5 3.75v12.5M12.5 3.75v12.5" />
      <rect x="3.5" y="6" width="3.25" height="3.5" fill="currentColor" stroke="none" />
      <rect x="8.25" y="10" width="3.5" height="5" fill="currentColor" stroke="none" />
      <rect x="13.25" y="5" width="3.25" height="3" fill="currentColor" stroke="none" />
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
