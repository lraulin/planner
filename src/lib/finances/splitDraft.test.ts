import { describe, expect, it } from "vitest";
import {
  emptySplitDraft,
  planSplitCommit,
  splitDraftFromSaved,
  splitDraftPayload,
  type SplitDraftChild,
} from "./splitDraft";

function draft(patch: Partial<SplitDraftChild> = {}): SplitDraftChild {
  return { ...emptySplitDraft("k"), amountCents: -500, ...patch };
}

describe("splitDraftFromSaved", () => {
  it("keys the draft by the saved row so the amount field keeps focus", () => {
    const row = splitDraftFromSaved({
      id: "child-1",
      amountCents: -3193,
      budgetCategoryId: "envelope-1",
      notes: "formula",
    });
    expect(row).toEqual({
      key: "child-1",
      id: "child-1",
      amountCents: -3193,
      amountText: "-31.93",
      budgetCategoryId: "envelope-1",
      notes: "formula",
    });
  });
});

describe("splitDraftPayload", () => {
  it("carries the saved id through so an edit updates the child instead of replacing it", () => {
    expect(
      splitDraftPayload([
        draft({ key: "a", id: "child-1", amountCents: -3193, notes: " formula " }),
        draft({ key: "b", amountCents: -16363, budgetCategoryId: "envelope-2" }),
      ]),
    ).toEqual([
      {
        id: "child-1",
        amountCents: -3193,
        budgetCategoryId: null,
        notes: " formula ",
      },
      { id: undefined, amountCents: -16363, budgetCategoryId: "envelope-2", notes: "" },
    ]);
  });
});

describe("planSplitCommit", () => {
  it("writes nothing when the editor was never opened", () => {
    expect(
      planSplitCommit({ alreadySplit: false, dirty: false, drafts: null }),
    ).toEqual({ kind: "none" });
  });

  it("writes nothing when the editor was opened and left alone", () => {
    // The scaffold two parts appear on disclosure; that is not an edit.
    expect(
      planSplitCommit({
        alreadySplit: false,
        dirty: false,
        drafts: [emptySplitDraft("a"), emptySplitDraft("b")],
      }),
    ).toEqual({ kind: "none" });
  });

  it("creates the split for a row that has none", () => {
    const drafts = [draft({ key: "a" }), draft({ key: "b", amountCents: -877 })];
    expect(planSplitCommit({ alreadySplit: false, dirty: true, drafts })).toEqual({
      kind: "create",
      children: splitDraftPayload(drafts),
    });
  });

  it("updates the children of a row that is already split", () => {
    const drafts = [draft({ key: "a", id: "child-1" })];
    expect(planSplitCommit({ alreadySplit: true, dirty: true, drafts })).toEqual({
      kind: "update",
      children: splitDraftPayload(drafts),
    });
  });

  it("unsplits when every part of an existing split was removed", () => {
    expect(planSplitCommit({ alreadySplit: true, dirty: true, drafts: [] })).toEqual({
      kind: "unsplit",
    });
  });

  it("writes nothing when parts were drafted for an unsplit row and then all removed", () => {
    // Reaching the mutation here would fail with "a split needs at least one child" over an
    // intent the user has already abandoned.
    expect(planSplitCommit({ alreadySplit: false, dirty: true, drafts: [] })).toEqual({
      kind: "none",
    });
  });
});
