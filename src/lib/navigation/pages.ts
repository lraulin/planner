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
 * Keyed by module id. A module absent from this map has no pages and renders no bar — Chooser,
 * Metrics and Fitness's siblings pay nothing for this feature.
 */
const PAGES = {
  /*
   * Plan is the outline, drawn seven ways.
   *
   * These were seven **modules** until the sidebar was re-sorted. Every one of their route
   * files called the same `loadOutline(userId)` and differed only in which grid received the
   * result — one dataset, seven presentations, which is the shape this registry exists to
   * hold. Achieve reached them the same way: sibling tabs behind one Go-menu entry.
   *
   * Task Chooser is deliberately *not* here. Taxonomically it is a variant of Tasks, but it is
   * where you go to decide what to do next, several times a day, from anywhere — and it holds
   * a scoring surface rather than an outline grid, so it would be the one tab in the set that
   * did not belong to it.
   *
   * Order is `modules.ts`'s old sidebar order, which was already chosen as Achieve's own.
   */
  plan: [
    {
      id: "overview",
      label: "Overview",
      segment: "overview",
      status: "built",
      /*
       * The hub, and the default — but reached through `lastPage`, so it is where a session
       * with no history lands rather than where every session lands. `/` used to redirect here
       * unconditionally, which meant someone who lives in Tasks re-picked Tasks every morning.
       */
      isDefault: true,
      keywords: "home productivity process capture organize prioritize plan do",
    },
    {
      id: "outline",
      label: "Outline",
      segment: "outline",
      status: "built",
      keywords: "tree result areas dreams hierarchy",
    },
    {
      id: "projects",
      label: "Projects",
      segment: "projects",
      status: "built",
      keywords: "project list",
    },
    {
      id: "tasks",
      label: "Tasks",
      segment: "tasks",
      status: "built",
      keywords: "task list todo",
    },
    {
      id: "goals",
      label: "Goals",
      segment: "goals",
      status: "built",
      keywords: "goal dreams objectives",
    },
    {
      id: "wishes",
      label: "Wish List",
      segment: "wishes",
      status: "built",
      keywords: "wish list someday maybe",
    },
    {
      id: "result-areas",
      label: "Result Areas",
      segment: "result-areas",
      status: "built",
      keywords: "result area roles life dimensions importance weighting",
    },
  ],

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
    /*
     * Last, and the only one that is not a week you are looking at: Time Charts is the
     * configuration behind the Calendar's background, edited rarely.
     *
     * It was its own Library module while its editor already lived at
     * `/schedule/time-chart/[chartId]` — which is the split that made `destinationLabel` need
     * a hardcoded ternary to name the place a Back link returned to.
     *
     * **The editor stays singular and does not move under this segment.** `pageForPathname`
     * matches a declared segment's whole subtree, so `/schedule/time-charts/abc` would resolve
     * to this page and the shell would draw the page bar on a focused flow that has its own
     * exit. The one-letter difference is the whole mechanism; do not tidy it away.
     */
    {
      id: "time-charts",
      label: "Time Charts",
      segment: "time-charts",
      status: "built",
      keywords: "time chart ideal week template background blocks",
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
   * Ordered by how often a page is opened, which for Finances is the reverse of how it was
   * built: the current position first, then the analysis behind it, then the records behind
   * that. Dashboard answers "can I spend this", which is a question asked daily; Register
   * answers "what did I spend", which is asked when something looks wrong.
   */
  finances: [
    {
      id: "dashboard",
      label: "Dashboard",
      segment: "dashboard",
      status: "built",
      isDefault: true,
      keywords: "available to spend payday balances envelopes budget now",
    },
    {
      id: "budget",
      label: "Budget",
      segment: "budget",
      status: "built",
      keywords:
        "envelope zero-based ready to assign assign categories ynab actual carryover rollover schedules recurring bills upcoming subscriptions commitments spend pizza set aside cadence review",
    },
    {
      id: "supplies",
      label: "Supplies",
      segment: "supplies",
      status: "built",
      keywords:
        "worksheet calculator unit cost price per compare vendor brand pack size consumables estimate rebuy recurring purchases cat food",
    },
    {
      id: "insights",
      label: "Insights",
      segment: "insights",
      status: "built",
      keywords: "spending baseline lumpy cashflow charts reports",
    },
    {
      id: "register",
      label: "Register",
      segment: "register",
      status: "built",
      keywords: "transactions ledger accounts import",
    },
    {
      id: "payees",
      label: "Payees",
      segment: "payees",
      status: "built",
      keywords: "merchants vendors aliases bank spellings identity auto category",
    },
    {
      id: "tags",
      label: "Tags",
      segment: "tags",
      status: "built",
      keywords: "labels notes reporting classification hashtags",
    },
    {
      id: "statements",
      label: "Statements",
      segment: "statements",
      status: "built",
      keywords: "reconcile snapshots closing balance coverage holes",
    },
    {
      id: "orders",
      label: "Orders",
      segment: "orders",
      status: "built",
      keywords: "amazon items subscribe receipts",
    },
    {
      id: "accounts",
      label: "Accounts",
      segment: "accounts",
      status: "built",
      keywords: "bank url rename close delete",
    },
  ],

  /*
   * Reference data you maintain but rarely sit in — the `Library` *section* turned into a
   * module, since a section holding two entries that were never places you work was spending
   * three sidebar rows to say so.
   *
   * Master contexts belong with these conceptually and are deliberately absent: their only UI
   * is `MasterContextsDialog`, and giving them a page is a new surface rather than a move.
   * Categories look like they belong too and do not exist as a thing to manage — `category` is
   * free text inherited down the tree, not a table. Life-event categories are free text for the
   * same reason: the grid's set filter offers the values in use, so there is nothing to manage.
   *
   * Timeline, Jobs and Residences are one feature in three pages. Timeline is the chronology
   * you read; the other two are the records that half of it is derived from, at read time. A
   * job's start and end appear on Timeline as two rows and are edited here — which is why
   * Timeline's row menu disables Delete on a derived row and offers Open instead.
   */
  library: [
    {
      id: "contacts",
      label: "Contacts",
      segment: "contacts",
      status: "built",
      isDefault: true,
      keywords: "people address book phone email rolodex who discussion items",
    },
    {
      id: "resources",
      label: "Resources",
      segment: "resources",
      status: "built",
      keywords: "capacity availability workload hours overhead effectiveness team",
    },
    {
      id: "timeline",
      label: "Timeline",
      segment: "timeline",
      status: "built",
      keywords:
        "chronology history milestones important dates anniversary age life events when did",
    },
    {
      id: "jobs",
      label: "Jobs",
      segment: "jobs",
      status: "built",
      keywords:
        "employment work career employer resume cv supervisor salary application history",
    },
    {
      id: "residences",
      label: "Residences",
      segment: "residences",
      status: "built",
      keywords:
        "address moved home lived apartment house landlord rent where did i live",
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

/**
 * Destinations that keep their own chrome and suppress the application menu.
 *
 * An explicit list, not "pageForPathname returned null". The bare module path, Chooser,
 * Metrics, Insights and Dashboard all return null or have no page bar and still need File.
 * Fitness session/exercise editors sit *inside* a declared page (`/fitness/sessions/abc`)
 * and keep the menu; `/fitness/log` does not.
 */
export function isFocusedFlow(pathname: string): boolean {
  if (pathname === "/schedule/plan" || pathname.startsWith("/schedule/plan/")) {
    return true;
  }
  if (pathname === "/fitness/log" || pathname.startsWith("/fitness/log/")) {
    return true;
  }
  if (pathname.startsWith("/schedule/time-chart/")) return true;
  return false;
}
