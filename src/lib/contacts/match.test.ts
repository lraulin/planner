import { describe, expect, it } from "vitest";
import { matchContacts, resolveContactQuery } from "./match";
import type { ContactOption } from "./types";

function person(id: string, displayName: string): ContactOption {
  return { id, displayName };
}

const book = [
  person("ada", "Ada King"),
  person("ada-l", "Ada Lovelace"),
  person("miranda", "Miranda"),
  person("johnny", "Johnny Yuel"),
  person("email", "ada@example.com"),
];

describe("matchContacts", () => {
  it("returns the given order when the query is empty", () => {
    expect(matchContacts(book, "  ").map((row) => row.id)).toEqual(
      book.map((row) => row.id),
    );
  });

  it("is case-insensitive and matches a display-name substring", () => {
    expect(matchContacts(book, "YUEL").map((row) => row.id)).toEqual(["johnny"]);
  });

  it("ranks a name prefix above a later substring", () => {
    const names = [person("kim", "Kim"), person("ada", "Ada King")];
    expect(matchContacts(names, "ki").map((row) => row.id)).toEqual(["kim", "ada"]);
  });

  it("requires every whitespace token on a multi-word query", () => {
    expect(matchContacts(book, "ada king").map((row) => row.id)).toEqual(["ada"]);
    expect(matchContacts(book, "ada missing")).toEqual([]);
  });

  it("returns nothing when no row matches", () => {
    expect(matchContacts(book, "nobody")).toEqual([]);
  });
});

describe("resolveContactQuery", () => {
  it("selects a unique exact display name", () => {
    expect(resolveContactQuery(book, "johnny yuel")?.id).toBe("johnny");
  });

  it("selects the only remaining match", () => {
    expect(resolveContactQuery(book, "yuel")?.id).toBe("johnny");
  });

  it("refuses an ambiguous exact name", () => {
    const twins = [person("a", "Pat Smith"), person("b", "Pat Smith")];
    expect(resolveContactQuery(twins, "Pat Smith")).toBeNull();
  });

  it("reverts when more than one row still matches", () => {
    expect(resolveContactQuery(book, "ada")).toBeNull();
  });

  it("reverts a typo", () => {
    expect(resolveContactQuery(book, "jonny")).toBeNull();
  });
});
