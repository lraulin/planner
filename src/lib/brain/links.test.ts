import { describe, expect, it } from "vitest";
import { canonicalLink, mirrorRelation, planLink, type LinkRow } from "./links";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

describe("canonicalLink", () => {
  it("runs a child link from parent to child", () => {
    expect(canonicalLink(A, "child", B)).toEqual({ fromId: A, toId: B, kind: "child" });
  });

  it("flips 'other is my parent' so the parent is the from side", () => {
    expect(canonicalLink(A, "parent", B)).toEqual({
      fromId: B,
      toId: A,
      kind: "child",
    });
  });

  it("orders a jump the same way whichever thought it was added from", () => {
    expect(canonicalLink(B, "jump", A)).toEqual(canonicalLink(A, "jump", B));
    expect(canonicalLink(B, "jump", A).fromId).toBe(A);
  });

  it("refuses a self link", () => {
    expect(() => canonicalLink(A, "jump", A)).toThrow();
  });
});

describe("planLink", () => {
  const existing = (over: Partial<LinkRow>): LinkRow => ({
    id: "L1",
    fromId: A,
    toId: B,
    kind: "child",
    ...over,
  });

  it("inserts when the pair is unlinked", () => {
    const wanted = canonicalLink(A, "child", B);
    expect(planLink(wanted, null)).toEqual({ action: "insert", link: wanted });
  });

  it("does nothing when the same link already exists", () => {
    expect(planLink(canonicalLink(A, "child", B), existing({}))).toEqual({
      action: "noop",
      id: "L1",
    });
  });

  it("updates in place when the direction is flipped", () => {
    const wanted = canonicalLink(A, "parent", B);
    expect(planLink(wanted, existing({}))).toEqual({
      action: "update",
      id: "L1",
      link: wanted,
    });
  });

  it("updates in place when a child link becomes a jump", () => {
    const wanted = canonicalLink(A, "jump", B);
    expect(planLink(wanted, existing({}))).toEqual({
      action: "update",
      id: "L1",
      link: wanted,
    });
  });
});

describe("mirrorRelation", () => {
  it("describes the same stored link from the other thought", () => {
    // A adds B as its child; B, asked about A, has a parent.
    const fromA = canonicalLink(A, "child", B);
    const fromB = canonicalLink(B, mirrorRelation("child"), A);
    expect(fromB).toEqual(fromA);
    expect(canonicalLink(B, mirrorRelation("jump"), A)).toEqual(
      canonicalLink(A, "jump", B),
    );
  });
});
