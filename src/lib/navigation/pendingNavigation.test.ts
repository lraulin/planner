import { describe, expect, it } from "vitest";
import { pageForPathname } from "./pages";
import {
  NAVIGATION_ABANDON_MS,
  NAVIGATION_PROGRESS_DELAY_MS,
  beginNavigation,
  beginRefresh,
  createPendingNavigationStore,
  endNavigation,
  isAbandoned,
  isPlainNavigationClick,
  livePending,
  presentedPathname,
  progressVisible,
  settleAt,
} from "./pendingNavigation";

const START = 1_000_000;

describe("beginNavigation", () => {
  it("is nothing to present when the destination is the page you are on", () => {
    expect(beginNavigation("/finances/budget", "/finances/budget", START)).toBeNull();
  });

  it("ignores a query-only change: the drawer and the view switch are not navigations", () => {
    expect(
      beginNavigation("/finances/budget", "/finances/budget?month=2026-09", START),
    ).toBeNull();
    expect(beginNavigation("/notes/journal", "/notes/journal#today", START)).toBeNull();
  });

  it("records a different page, with its query", () => {
    expect(beginNavigation("/plan/tasks", "/plan/goals?x=1", START)).toEqual({
      href: "/plan/goals?x=1",
      fromPathname: "/plan/tasks",
      startedAt: START,
      kind: "navigate",
    });
  });
});

describe("presentedPathname", () => {
  it("is the real pathname with nothing pending", () => {
    expect(presentedPathname("/plan/tasks", null)).toBe("/plan/tasks");
  });

  it("lets the pending destination win while the address bar has not moved", () => {
    const pending = beginNavigation("/plan/tasks", "/finances/budget?month=1", START);
    expect(presentedPathname("/plan/tasks", pending)).toBe("/finances/budget");
  });

  it("returns to the address bar once it has moved off where the click began", () => {
    // Arrival, a redirect that landed somewhere else, and a newer navigation all look alike
    // from here: the address bar is no longer where the click was made.
    const pending = beginNavigation("/plan", "/plan/tasks", START);
    expect(presentedPathname("/plan/tasks", pending)).toBe("/plan/tasks");
    expect(presentedPathname("/plan/wishes", pending)).toBe("/plan/wishes");
  });

  it("does not move the active look for a refresh, which has no destination", () => {
    const refresh = beginRefresh("/finances/budget", START);
    expect(presentedPathname("/finances/budget", refresh)).toBe("/finances/budget");
  });

  it("resolves a focused-flow destination to no page tab", () => {
    const pending = beginNavigation("/schedule/calendar", "/schedule/plan", START);
    const shown = presentedPathname("/schedule/calendar", pending);
    expect(shown).toBe("/schedule/plan");
    expect(pageForPathname("schedule", "/schedule", shown)).toBeNull();
    // and the tab you are leaving is no longer the lit one
    expect(pageForPathname("schedule", "/schedule", "/schedule/calendar")?.id).toBe(
      "calendar",
    );
  });
});

describe("progressVisible", () => {
  const pending = beginNavigation("/plan/tasks", "/finances/register", START);

  it("draws nothing for a navigation that finishes under the delay", () => {
    expect(progressVisible(pending, "/plan/tasks", START)).toBe(false);
    expect(
      progressVisible(pending, "/plan/tasks", START + NAVIGATION_PROGRESS_DELAY_MS - 1),
    ).toBe(false);
  });

  it("draws the bar once the delay has passed", () => {
    expect(
      progressVisible(pending, "/plan/tasks", START + NAVIGATION_PROGRESS_DELAY_MS),
    ).toBe(true);
  });

  it("stops drawing the moment the address bar moves", () => {
    expect(
      progressVisible(
        pending,
        "/finances/register",
        START + NAVIGATION_PROGRESS_DELAY_MS,
      ),
    ).toBe(false);
  });

  it("shows an arrival refresh from the start, since the content is already stale", () => {
    const refresh = beginRefresh("/finances/budget", START);
    expect(progressVisible(refresh, "/finances/budget", START)).toBe(true);
  });
});

describe("clearing", () => {
  const pending = beginNavigation("/plan/tasks", "/finances/budget", START);

  it("ends only the navigation the idle link was for", () => {
    expect(endNavigation(pending, "/finances/budget")).toBeNull();
    // a newer click replaced the record; the old link going idle must not clear it
    expect(endNavigation(pending, "/plan/goals")).toBe(pending);
  });

  it("settles a record that began somewhere else, so Back cannot revive it", () => {
    expect(settleAt(pending, "/finances/budget")).toBeNull();
    expect(settleAt(pending, "/plan/tasks")).toBe(pending);
    // the stale record would be live again at its origin — which is the bug settling prevents
    expect(livePending(pending, "/plan/tasks")).toBe(pending);
  });

  it("abandons a record nothing reported the end of", () => {
    expect(isAbandoned(pending, START + NAVIGATION_ABANDON_MS - 1)).toBe(false);
    expect(isAbandoned(pending, START + NAVIGATION_ABANDON_MS)).toBe(true);
    expect(isAbandoned(null, START + NAVIGATION_ABANDON_MS)).toBe(false);
  });
});

describe("isPlainNavigationClick", () => {
  const plain = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };

  it("accepts a plain left click", () => {
    expect(isPlainNavigationClick(plain)).toBe(true);
    expect(isPlainNavigationClick({ ...plain, target: "_self" })).toBe(true);
  });

  it("rejects every click the router hands to the browser", () => {
    for (const change of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
      { defaultPrevented: true },
      { target: "_blank" },
      { download: true },
    ]) {
      expect(isPlainNavigationClick({ ...plain, ...change })).toBe(false);
    }
  });
});

describe("createPendingNavigationStore", () => {
  it("notifies on change only, and a same-page click clears an older record", () => {
    const store = createPendingNavigationStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });

    store.begin("/plan/tasks", "/finances/budget", START);
    expect(store.get()?.href).toBe("/finances/budget");
    expect(calls).toBe(1);

    store.begin("/plan/tasks", "/finances/budget", START + 1); // a new record object
    store.begin("/plan/tasks", "/plan/tasks", START + 2); // back to where we are
    expect(store.get()).toBeNull();

    store.clear();
    expect(calls).toBe(3); // clearing nothing is not a change
  });

  it("keeps an arrival refresh separate from link navigations", () => {
    const store = createPendingNavigationStore();
    store.beginRefresh("/finances/budget", START);
    store.end("/finances/budget"); // a link going idle is not the refresh finishing
    expect(store.get()?.kind).toBe("refresh");
    store.endRefresh();
    expect(store.get()).toBeNull();
  });
});
