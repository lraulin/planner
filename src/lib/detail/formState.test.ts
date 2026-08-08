import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import { formState, isStateEdit } from "./formState";

const TODAY = "2026-08-08";
const at = fromDateKey;

describe("formState", () => {
  it("shows Not started for a routine whose shelf has run out", () => {
    // The case that made mobile complete look like a no-op: list says NS, form said
    // Postponed, Save put Postponed back.
    expect(
      formState({ state: "postponed", deferredDate: at("2026-08-07") }, TODAY),
    ).toBe("not_started");
  });

  it("still shows Postponed while the shelf holds", () => {
    expect(
      formState({ state: "postponed", deferredDate: at("2026-08-09") }, TODAY),
    ).toBe("postponed");
  });

  it("passes other states through", () => {
    expect(formState({ state: "in_progress", deferredDate: null }, TODAY)).toBe(
      "in_progress",
    );
    expect(formState({ state: "completed", deferredDate: null }, TODAY)).toBe(
      "completed",
    );
  });
});

describe("isStateEdit", () => {
  const expiredShelf = {
    state: "postponed" as const,
    deferredDate: at("2026-08-07"),
  };

  it("does not treat a re-post of the effective Not started as an edit", () => {
    // Opening the drawer and saving notes must not rewrite postponed → not_started.
    expect(isStateEdit(expiredShelf, "not_started", TODAY)).toBe(false);
  });

  it("does treat Completed as an edit on a due-again routine", () => {
    // The fix for "complete and save has no effect": this has to be a real transition.
    expect(isStateEdit(expiredShelf, "completed", TODAY)).toBe(true);
  });

  it("does treat an explicit un-shelve of a still-holding shelf as an edit", () => {
    const holding = {
      state: "postponed" as const,
      deferredDate: at("2026-08-15"),
    };
    expect(isStateEdit(holding, "not_started", TODAY)).toBe(true);
  });

  it("ignores a re-save of the same stored state", () => {
    expect(
      isStateEdit({ state: "in_progress", deferredDate: null }, "in_progress", TODAY),
    ).toBe(false);
  });

  it("treats a plain Not started → Completed as an edit", () => {
    expect(
      isStateEdit({ state: "not_started", deferredDate: null }, "completed", TODAY),
    ).toBe(true);
  });
});
