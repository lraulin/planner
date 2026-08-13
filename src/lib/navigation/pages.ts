/**
 * Every **page** the app has: a destination *inside* a module.
 *
 * Three tiers, and they are not synonyms:
 *
 * | Word     | Means                                                        |
 * | -------- | ------------------------------------------------------------ |
 * | Module   | A sidebar destination — Tasks, Fitness, Schedule              |
 * | **Page** | A destination within one — Sessions, Journal, Agenda          |
 * | View     | A saved collection of filter / column / sort settings         |
 *
 * Four modules used to answer "how do I get to the other thing in here?" four different ways —
 * two bordered segments with one look, a third with another, and a bare pair of links — because
 * `navigation.md` governed modules and commands and said nothing about the tier between them.
 * This is that tier, and it obeys the same rules one level down: one registry, `reserved`
 * renders nowhere, and placement belongs to the entry rather than to the surface.
 *
 * **Why the data is here and the accessor is in `components/shell/modules.ts`.** Pages carry no
 * icons — the bar is text — so this file is pure and can be unit-tested, which the resolver
 * below badly needs. `modules.ts` imports React icon components, so a `src/lib` file cannot
 * import it. Without the icons these would be one file.
 *
 * The rejected alternative, recorded because it looks reasonable: splitting these by whether
 * they show the same records differently (Schedule Calendar/Agenda) or different records
 * entirely (Fitness Sessions/Exercises), and giving each half its own control. It does not
 * survive the cases — Notes Grid→Journal changes which notes you see *and* what a selection
 * means, so it sits between the two — and a rule that makes each author pick a side of a line
 * that is not there is how four modules ended up with three treatments in the first place. The
 * question that does divide cleanly is "is this a place you can be?", and all of them are.
 */

export type PageStatus = "built" | "reserved";

export type PageEntry = {
  id: string;
  label: string;
  /** Appended to the module's own href. `/fitness` + `sessions` = `/fitness/sessions`. */
  segment: string;
  /**
   * `reserved` is a page we have decided the home of but not built. It renders nowhere and is
   * not a navigation target; adding it later is a one-word edit rather than another argument
   * about navigation. Deliberately *not* shown as a disabled tab — `navigation.md`: a menu full
   * of dead rows teaches the reader to stop reading the menu.
   */
  status: PageStatus;
  /** Where the bare module path lands with nothing remembered. Exactly one built page per module. */
  isDefault?: true;
  /** Names the label does not carry, for the command palette. */
  keywords?: string;
};

/**
 * Keyed by module id. A module absent from this map has no pages and renders no bar — which is
 * most of them, and the reason Tasks, Projects, Goals, Outline, Chooser, Metrics, Resources and
 * Contacts pay nothing for this feature.
 */
const PAGES = {
  /*
   * Schedule holds Day and Week Plan because Day stopped being a module. It was shelved —
   * Task Chooser covers the daily-pick job better and Day still feels half-finished — and
   * `modules.ts` had already written down the alternative to deleting it: "folding it into
   * Schedule is a status flip, not a rebuild". As a page among three siblings an unfinished
   * surface is visible without reading as a broken top-level destination.
   *
   * Ordered narrowest-scope first, with the two drawings of the same range kept adjacent.
   */
  schedule: [
    {
      id: "day",
      label: "Day",
      segment: "day",
      status: "built",
      keywords: "today daily page franklin covey journal",
    },
    {
      id: "calendar",
      label: "Calendar",
      segment: "calendar",
      status: "built",
      isDefault: true,
      keywords: "week time blocking appointments grid",
    },
    {
      id: "agenda",
      label: "Agenda",
      segment: "agenda",
      status: "built",
      keywords: "list days left",
    },
    {
      id: "week-plan",
      label: "Week Plan",
      segment: "week-plan",
      status: "built",
      keywords: "weekly planning assign tasks to days",
    },
  ],

  fitness: [
    {
      id: "sessions",
      label: "Sessions",
      segment: "sessions",
      status: "built",
      isDefault: true,
      keywords: "workout history log sets reps",
    },
    {
      id: "exercises",
      label: "Exercises",
      segment: "exercises",
      status: "built",
      keywords: "catalog movements equipment",
    },
  ],

  notes: [
    {
      id: "grid",
      label: "Grid",
      segment: "grid",
      status: "built",
      isDefault: true,
      keywords: "list nested notes",
    },
    {
      id: "journal",
      label: "Journal",
      segment: "journal",
      status: "built",
      keywords: "diary calendar date tree rednotebook daily",
    },
  ],

  /*
   * One built page, so Finances renders no bar yet. That is the >=2 rule working rather than a
   * bug, and it is written down here so nobody "fixes" it. The active finances-insights spec
   * flips `insights` to built, and the bar appears the same day.
   */
  finances: [
    {
      id: "register",
      label: "Register",
      segment: "register",
      status: "built",
      isDefault: true,
      keywords: "transactions ledger accounts import",
    },
    {
      id: "insights",
      label: "Insights",
      segment: "insights",
      status: "reserved",
      keywords: "spending baseline lumpy cashflow charts dashboard",
    },
  ],
} as const satisfies Record<string, readonly PageEntry[]>;

/** The module ids that have pages. `modules.ts` asserts at compile time that these are real. */
export type PagedModuleId = keyof typeof PAGES;

/** Every declared page for a module, built and reserved alike. Empty for a module with none. */
export function pagesForModule(moduleId: string): readonly PageEntry[] {
  return (PAGES as Record<string, readonly PageEntry[]>)[moduleId] ?? [];
}

/** The pages that exist. The only ones anything renders or navigates to. */
export function builtPagesForModule(moduleId: string): readonly PageEntry[] {
  return pagesForModule(moduleId).filter((page) => page.status === "built");
}

/**
 * Whether a module shows a page bar at all.
 *
 * A single tab is chrome that teaches nothing — it costs a row to say "you are in the only
 * place there is" — so the floor is two, the same floor `navigation.md` puts on a menu fly-out.
 */
export function hasPageBar(moduleId: string): boolean {
  return builtPagesForModule(moduleId).length >= 2;
}

/** Where the bare module path lands with nothing remembered. */
export function defaultPageFor(moduleId: string): PageEntry | null {
  const built = builtPagesForModule(moduleId);
  return built.find((page) => page.isDefault) ?? built[0] ?? null;
}

/** A stored or requested page id, dropped to one that is actually built. */
export function builtPageById(
  moduleId: string,
  pageId: string | null,
): PageEntry | null {
  if (!pageId) return null;
  return builtPagesForModule(moduleId).find((page) => page.id === pageId) ?? null;
}

export function pageHref(basePath: string, page: PageEntry): string {
  return `${basePath}/${page.segment}`;
}

/**
 * Which page a pathname is on, or `null` if it is on none.
 *
 * **A declared segment matches its own subtree; anything undeclared matches nothing.** Both
 * halves are load-bearing and neither is the rule you would reach for first:
 *
 * - `/fitness/sessions/abc` is the session editor, which `FitnessView` renders *inside* the
 *   Sessions page. An exact-match rule would drop the bar there, so the editor would look like
 *   it had left the module.
 * - `/schedule/time-chart/abc` is a focused flow with its own Back. It is not a declared page,
 *   so it gets no bar — a "first segment after the module" rule would invent one.
 *
 * The bare module path returns `null` too: no page has been chosen yet, which is the redirect's
 * job, not the bar's.
 */
export function pageForPathname(
  moduleId: string,
  basePath: string,
  pathname: string,
): PageEntry | null {
  if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null;

  const rest = pathname.slice(basePath.length);
  if (rest === "" || rest === "/") return null;

  // The trailing-slash boundary is what keeps `week` from claiming `/week-plan`, so at most one
  // declared segment can ever match and the order of the list does not matter.
  return (
    builtPagesForModule(moduleId).find(
      (page) => rest === `/${page.segment}` || rest.startsWith(`/${page.segment}/`),
    ) ?? null
  );
}
