import { describe, expect, it } from "vitest";
import { learnedCategory } from "./categoryLearning";

describe("learnedCategory", () => {
  it("learns one category used three times among the latest five", () => {
    expect(
      learnedCategory("edited", [
        { id: "edited", categoryId: "food" },
        { id: "2", categoryId: null },
        { id: "3", categoryId: "food" },
        { id: "4", categoryId: "other" },
        { id: "5", categoryId: "food" },
      ]),
    ).toBe("food");
  });

  it("does not learn when the edited row is outside the latest five", () => {
    expect(
      learnedCategory("old", [
        { id: "1", categoryId: "food" },
        { id: "2", categoryId: "food" },
        { id: "3", categoryId: "food" },
        { id: "4", categoryId: null },
        { id: "5", categoryId: null },
        { id: "old", categoryId: "food" },
      ]),
    ).toBeNull();
  });
});
