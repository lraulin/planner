import { describe, expect, it } from "vitest";
import { formatBindings, matchBindings, type KeyEventLike } from "./bindings";
import {
  DELETE_ROW,
  INSERT_AFTER,
  INSERT_BEFORE,
  INSERT_CHILD,
  OPEN_RECORD,
  RENAME,
} from "./chords";

function press(key: string, modifiers: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

/**
 * Five of the six chords are Return with a different modifier set, which is what makes the scheme
 * learnable and also what makes it fragile: add one more Return chord that forgets a modifier and
 * it silently shadows a neighbour. `CommandKeys` runs the *first* command whose bindings match, so
 * the loser does not error — it just stops happening, on a keypress the user has been making for
 * months.
 */
const FAMILY: [string, ReturnType<() => KeyEventLike>, typeof INSERT_AFTER][] = [
  ["open", press("Enter"), OPEN_RECORD],
  ["rename", press("Enter", { shiftKey: true }), RENAME],
  ["insert after", press("Enter", { metaKey: true }), INSERT_AFTER],
  ["insert before", press("Enter", { metaKey: true, shiftKey: true }), INSERT_BEFORE],
  ["insert child", press("Enter", { metaKey: true, altKey: true }), INSERT_CHILD],
  ["delete", press("Backspace"), DELETE_ROW],
];

describe("the Return family", () => {
  it.each(FAMILY)("gives %s its chord and no other", (_label, event, own) => {
    for (const [otherLabel, , other] of FAMILY) {
      expect(matchBindings(event, other), otherLabel).toBe(other === own);
    }
  });

  /**
   * Achieve's keys stay bound for a full keyboard, but a chord the MacBook cannot produce must
   * never be the one printed — that was the whole defect this scheme replaced.
   */
  it("prints the chord this keyboard can actually make", () => {
    expect(formatBindings(INSERT_CHILD)).toBe("⌥⌘⏎");
    expect(formatBindings(INSERT_AFTER)).toBe("⌘⏎");
    expect(formatBindings(INSERT_BEFORE)).toBe("⇧⌘⏎");
    expect(formatBindings(RENAME)).toBe("⇧⏎");
    expect(formatBindings(OPEN_RECORD)).toBe("⏎");
    expect(formatBindings(DELETE_ROW)).toBe("⌫");
  });

  it("still answers Achieve's keys on a keyboard that has them", () => {
    expect(matchBindings(press("Insert"), INSERT_AFTER)).toBe(true);
    expect(matchBindings(press("Insert", { shiftKey: true }), INSERT_BEFORE)).toBe(
      true,
    );
    expect(matchBindings(press("Insert", { ctrlKey: true }), INSERT_CHILD)).toBe(true);
    expect(matchBindings(press("F2"), RENAME)).toBe(true);
    expect(matchBindings(press("Delete"), DELETE_ROW)).toBe(true);
  });
});
