/**
 * The bottom nav's icons.
 *
 * Hand-drawn rather than pulled from an icon package: five 20px glyphs do not justify a
 * dependency, and the app has none for UI today (`tech-stack.md` — no component library).
 * They inherit `currentColor` so the active/inactive states are handled by the nav.
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
