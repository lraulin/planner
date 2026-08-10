import { describe, expect, it } from "vitest";
import { shouldDiscardVirginInsert } from "./virginInsert";

const base = {
  virginInsertId: "new-1",
  editingId: "new-1",
  committedName: "",
  draftName: "",
} as const;

describe("shouldDiscardVirginInsert", () => {
  it("discards a just-created empty row when the name draft is still empty", () => {
    expect(shouldDiscardVirginInsert({ ...base })).toBe(true);
  });

  it("keeps the row when the user typed something then Escape", () => {
    expect(shouldDiscardVirginInsert({ ...base, draftName: "hello" })).toBe(false);
  });

  it("treats whitespace-only draft as empty (still discard)", () => {
    expect(shouldDiscardVirginInsert({ ...base, draftName: "   " })).toBe(true);
  });

  it("does not discard when renaming an existing empty-named row (not virgin)", () => {
    expect(
      shouldDiscardVirginInsert({
        ...base,
        virginInsertId: null,
      }),
    ).toBe(false);
  });

  it("does not discard when virgin id does not match the row being edited", () => {
    expect(
      shouldDiscardVirginInsert({
        ...base,
        virginInsertId: "other",
      }),
    ).toBe(false);
  });

  it("does not discard when editing has already ended", () => {
    expect(
      shouldDiscardVirginInsert({
        ...base,
        editingId: null,
      }),
    ).toBe(false);
  });

  it("does not discard when the committed name is no longer empty", () => {
    expect(
      shouldDiscardVirginInsert({
        ...base,
        committedName: "Saved",
      }),
    ).toBe(false);
  });

  it("trims committed name the same way as draft", () => {
    expect(
      shouldDiscardVirginInsert({
        ...base,
        committedName: "  ",
      }),
    ).toBe(true);
  });
});
