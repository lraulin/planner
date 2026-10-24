import { describe, expect, it } from "vitest";
import { parseThoughtId } from "./thoughtId";

describe("parseThoughtId", () => {
  it("accepts a uuid", () => {
    const id = "6f1d5c2e-3b7a-4c58-9d0e-1a2b3c4d5e6f";
    expect(parseThoughtId(id)).toBe(id);
  });

  it.each([
    undefined,
    "",
    "not-a-uuid",
    "6f1d5c2e-3b7a-4c58-9d0e-1a2b3c4d5e6",
    ["6f1d5c2e-3b7a-4c58-9d0e-1a2b3c4d5e6f"],
  ])("treats %j as no thought", (raw) => {
    expect(parseThoughtId(raw)).toBeNull();
  });
});
