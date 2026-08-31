import { describe, expect, it } from "vitest";
import { withQuery } from "./query";

describe("withQuery", () => {
  it("leaves a path alone when every param is missing", () => {
    expect(withQuery("/schedule/agenda", {})).toBe("/schedule/agenda");
    expect(withQuery("/tasks", { detail: undefined })).toBe("/tasks");
  });

  it("re-encodes reserved characters instead of concatenating", () => {
    // Concatenating `?detail=` + a raw id would split on `&` and `#`. Next hands
    // searchParams as a record, so this is the hop `legacyRedirect` has to survive.
    expect(withQuery("/tasks", { detail: "a&b=c" })).toBe("/tasks?detail=a%26b%3Dc");
  });

  it("repeats a key when Next hands an array", () => {
    expect(withQuery("/notes", { tag: ["work", "home"] })).toBe(
      "/notes?tag=work&tag=home",
    );
  });
});
