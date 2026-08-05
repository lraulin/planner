import { describe, expect, it } from "vitest";
import {
  compareContacts,
  displayNameOf,
  fileAsOf,
  formalNameOf,
  formatBirthday,
  initialsOf,
  primaryOf,
  UNNAMED_CONTACT,
  type NameParts,
} from "./name";

function parts(overrides: Partial<NameParts> = {}): NameParts {
  return {
    namePrefix: "",
    givenName: "",
    middleName: "",
    familyName: "",
    nameSuffix: "",
    nickname: "",
    initials: "",
    fileAs: "",
    company: "",
    ...overrides,
  };
}

describe("displayNameOf", () => {
  it("joins the name parts a grid column can afford", () => {
    expect(
      displayNameOf(
        parts({ givenName: "Ada", middleName: "Byron", familyName: "King" }),
      ),
    ).toBe("Ada Byron King");
  });

  it("leaves out prefix and suffix — Google's rule, and a 12rem column's", () => {
    const p = parts({
      namePrefix: "Dr.",
      givenName: "Ada",
      familyName: "King",
      nameSuffix: "Jr.",
    });
    expect(displayNameOf(p)).toBe("Ada King");
    expect(formalNameOf(p)).toBe("Dr. Ada King Jr.");
  });

  it("does not double-space around a missing middle name", () => {
    expect(displayNameOf(parts({ givenName: "Ada", familyName: "King" }))).toBe(
      "Ada King",
    );
  });

  it("treats a whitespace-only part as absent, with no leading space", () => {
    expect(displayNameOf(parts({ givenName: "   ", familyName: "King" }))).toBe("King");
  });

  it("falls back to the nickname, then the company, then an email", () => {
    expect(displayNameOf(parts({ nickname: "Bug" }))).toBe("Bug");
    expect(displayNameOf(parts({ company: "Analytical Engines Ltd" }))).toBe(
      "Analytical Engines Ltd",
    );
    expect(displayNameOf(parts(), "ada@example.com")).toBe("ada@example.com");
  });

  it("names an empty contact rather than rendering a blank row", () => {
    expect(displayNameOf(parts())).toBe(UNNAMED_CONTACT);
  });
});

describe("fileAsOf", () => {
  it("puts the family name first, which is what a list sorts by", () => {
    expect(
      fileAsOf(parts({ givenName: "Ada", middleName: "Byron", familyName: "King" })),
    ).toBe("King, Ada Byron");
  });

  it("uses a stored override ahead of the derived form", () => {
    expect(
      fileAsOf(parts({ givenName: "Ada", familyName: "King", fileAs: "Countess" })),
    ).toBe("Countess");
  });

  it("treats a whitespace-only override as no override", () => {
    // The bug you ship if you test `!== ""` instead of trimming: an override of spaces
    // wins, and the contact sorts under nothing.
    expect(
      fileAsOf(parts({ givenName: "Ada", familyName: "King", fileAs: "   " })),
    ).toBe("King, Ada");
  });

  it("handles a family name with no given name, and the reverse", () => {
    expect(fileAsOf(parts({ familyName: "King" }))).toBe("King");
    expect(fileAsOf(parts({ givenName: "Ada" }))).toBe("Ada");
  });

  it("falls back to the company for a vendor with no person", () => {
    expect(fileAsOf(parts({ company: "Analytical Engines Ltd" }))).toBe(
      "Analytical Engines Ltd",
    );
  });

  it("never returns blank, so no row sorts to the top for no visible reason", () => {
    expect(fileAsOf(parts())).toBe(UNNAMED_CONTACT);
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the given and family names", () => {
    expect(initialsOf(parts({ givenName: "Ada", familyName: "King" }))).toBe("AK");
  });

  it("uses a stored override — Achieve has the field and someone filled it in", () => {
    expect(
      initialsOf(parts({ givenName: "Ada", familyName: "King", initials: "ABK" })),
    ).toBe("ABK");
  });

  it("takes one letter from a hyphenated given name, not two", () => {
    expect(initialsOf(parts({ givenName: "Mary-Jane", familyName: "King" }))).toBe(
      "MK",
    );
  });

  it("does not try to be clever about surname particles", () => {
    // Pinned deliberately: the family initial is "V" for the particle, not "B" for Berg.
    // Which particles are droppable is a per-language problem with no right answer, so we
    // do not guess. Do not "fix" this to "PB".
    expect(initialsOf(parts({ givenName: "Piet", familyName: "van der Berg" }))).toBe(
      "PV",
    );
  });

  it("keeps a combining mark with its letter", () => {
    expect(initialsOf(parts({ givenName: "Ólafur", familyName: "Arnalds" }))).toBe(
      "ÓA",
    );
  });

  it("does not split a surrogate pair into half a code point", () => {
    // `s[0]` here yields a lone high surrogate, which renders as a replacement glyph.
    const result = initialsOf(parts({ givenName: "😀mile", familyName: "King" }));
    expect(result).toBe("😀K");
    expect(result).not.toContain("�");
  });

  it("takes two letters from a company when there is no person", () => {
    expect(initialsOf(parts({ company: "Acme" }))).toBe("AC");
  });

  it("returns nothing rather than a placeholder, leaving the render to the caller", () => {
    // Note there is no email fallback here, unlike displayNameOf: "AD" from
    // "ada@example.com" is noise, not identity.
    expect(initialsOf(parts())).toBe("");
  });
});

describe("primaryOf", () => {
  const item = (sortKey: string, isPrimary = false) => ({
    sortKey,
    isPrimary,
    id: sortKey,
  });

  it("is null for an empty list", () => {
    expect(primaryOf([])).toBeNull();
  });

  it("takes the only item when none is flagged", () => {
    expect(primaryOf([item("a")])?.id).toBe("a");
  });

  it("prefers the flagged item over the first one", () => {
    expect(primaryOf([item("a"), item("b", true)])?.id).toBe("b");
  });

  it("falls back to the lowest sort key, which is Google's array order", () => {
    expect(primaryOf([item("b"), item("a")])?.id).toBe("a");
  });

  it("picks deterministically when two rows are flagged", () => {
    // The partial unique index should make this unreachable, but a restore or a hand-run
    // UPDATE can produce it, and a list that picks differently per render is worse.
    expect(primaryOf([item("b", true), item("a", true)])?.id).toBe("a");
  });

  it("does not reorder the caller's array", () => {
    const items = [item("c"), item("a"), item("b")];
    primaryOf(items);
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("compareContacts", () => {
  const sort = (names: string[]) =>
    [...names].sort((a, b) => compareContacts({ fileAs: a }, { fileAs: b }));

  it("ignores diacritics, so a name lands where someone would look for it", () => {
    // Code-point order puts "Ångström" after "Zulu", which is how a name goes missing.
    expect(sort(["Zulu", "Ångström", "Anderson"])).toEqual([
      "Anderson",
      "Ångström",
      "Zulu",
    ]);
  });

  it("ignores case", () => {
    expect(sort(["banana", "Apple"])).toEqual(["Apple", "banana"]);
  });

  it("sorts a blank file-as last, not first", () => {
    expect(sort(["Zulu", "", "Anderson"])).toEqual(["Anderson", "Zulu", ""]);
  });
});

describe("formatBirthday", () => {
  it("renders a day and month without a year — the common case in People", () => {
    expect(formatBirthday(null, 1, 4)).toBe("4 Jan");
  });

  it("includes the year when it is known", () => {
    expect(formatBirthday(1979, 1, 4)).toBe("4 Jan 1979");
  });

  it("renders a year on its own, which People permits", () => {
    expect(formatBirthday(1979, null, null)).toBe("1979");
  });

  it("is blank when nothing is set", () => {
    expect(formatBirthday(null, null, null)).toBe("");
  });

  it("does not throw on a month with no day", () => {
    // A CHECK forbids this reaching the database; the renderer still must not crash on it.
    expect(formatBirthday(null, 1, null)).toBe("");
    expect(formatBirthday(1979, 1, null)).toBe("1979");
  });

  it("ignores an out-of-range month rather than indexing off the end", () => {
    expect(formatBirthday(null, 13, 4)).toBe("");
  });
});
