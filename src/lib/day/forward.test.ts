import { describe, expect, it } from "vitest";
import { itemsToForward, type ForwardCandidate } from "./forward";

function item(
  id: string,
  day: string,
  overrides: Partial<ForwardCandidate> = {},
): ForwardCandidate {
  return {
    id,
    day,
    state: "not_started",
    completedAt: null,
    forwardedTo: null,
    ...overrides,
  };
}

const TODAY = "2026-07-31";

describe("itemsToForward", () => {
  it("carries an unfinished row from an earlier day", () => {
    expect(itemsToForward([item("a", "2026-07-30")], TODAY)).toEqual(["a"]);
  });

  it("leaves today's own rows alone", () => {
    expect(itemsToForward([item("a", TODAY)], TODAY)).toEqual([]);
  });

  it("leaves rows planned for a future day alone", () => {
    // The whole point of the week view: deciding now to do something on Friday must not be
    // undone by opening the app on Thursday.
    expect(itemsToForward([item("a", "2026-08-03")], TODAY)).toEqual([]);
  });

  it("does not carry a completed row", () => {
    const done = item("a", "2026-07-30", {
      completedAt: new Date("2026-07-30T18:00:00Z"),
    });
    expect(itemsToForward([done], TODAY)).toEqual([]);
  });

  it("does not carry a cancelled row", () => {
    // Forwarding this would silently reverse a deliberate decision not to do it.
    // Cancel is not delete — the line stays on the original day as settled history.
    expect(
      itemsToForward([item("a", "2026-07-30", { state: "cancelled" })], TODAY),
    ).toEqual([]);
  });

  it("carries delegated and waiting rows, which are still open commitments", () => {
    const rows = [
      item("a", "2026-07-30", { state: "delegated" }),
      item("b", "2026-07-30", { state: "waiting" }),
      item("c", "2026-07-30", { state: "in_progress" }),
    ];
    expect(itemsToForward(rows, TODAY)).toEqual(["a", "b", "c"]);
  });

  it("is idempotent: an already-forwarded row is not carried again", () => {
    // This is what makes running carry-over on every page load safe.
    const already = item("a", "2026-07-30", { forwardedTo: TODAY });
    expect(itemsToForward([already], TODAY)).toEqual([]);
  });

  it("carries rows from several earlier days at once", () => {
    // Coming back after a week away collapses everything onto today rather than
    // reconstructing days that were never planned.
    const rows = [
      item("a", "2026-07-20"),
      item("b", "2026-07-28"),
      item("c", "2026-07-30"),
    ];
    expect(itemsToForward(rows, TODAY)).toEqual(["a", "b", "c"]);
  });

  it("compares days as calendar strings, not timestamps", () => {
    // A row dated the 30th is behind the 31st regardless of any time-of-day component,
    // which is why `day` is a date column and not a timestamp.
    expect(itemsToForward([item("a", "2026-07-30")], "2026-07-31")).toEqual(["a"]);
    expect(itemsToForward([item("a", "2026-12-31")], "2027-01-01")).toEqual(["a"]);
  });
});
