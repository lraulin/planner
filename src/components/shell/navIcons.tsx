/**
 * The navigation glyphs — one per view for the collapsed sidebar rail, plus the phone
 * bottom nav's and the shell's own chrome.
 *
 * Hand-drawn rather than pulled from an icon package: 20px glyphs at this count still do
 * not justify a dependency, and the app has none for UI today (`tech-stack.md` — no
 * component library). They inherit `currentColor`, so active/inactive states are handled
 * by whatever renders them.
 *
 * A collapsed rail is icons *only*, so these are the entire label for a view at 48px. Each
 * one is drawn to be distinguishable at a glance from the others in its section rather
 * than to be individually clever — `title` carries the name for anyone unsure.
 */
const BASE = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

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

/**
 * The sidebar's collapse toggle. One glyph flipped with a transform rather than two paths:
 * the two states are the same chevron pointing opposite ways, and drawing them separately
 * is how they drift apart.
 */
export function ChevronIcon({ pointing }: { pointing: "left" | "right" }) {
  return (
    <svg
      {...BASE}
      className={`h-4 w-4 ${pointing === "right" ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
    >
      <path d="m12 5-5 5 5 5" />
    </svg>
  );
}
