import { describe, expect, it } from "vitest";
import { formatBindings, matchBindings, type KeyEventLike } from "./bindings";
import {
  COLLAPSE_ALL,
  COLLAPSE_SELECTED,
  COMMIT_FORM,
  COMPLETE,
  COPY_AS_TEXT,
  CUT_ROWS,
  DELETE_ROW,
  EXPAND_ALL,
  EXPAND_SELECTED,
  INDENT,
  INSERT_AFTER,
  INSERT_BEFORE,
  INSERT_CHILD,
  MARKDOWN_BOLD,
  MARKDOWN_ITALIC,
  MOVE_DOWN,
  MOVE_UP,
  OPEN_FIND,
  OPEN_PALETTE,
  OPEN_RECORD,
  OUTDENT,
  PASTE_ROWS,
  QUICK_CAPTURE,
  RENAME,
  SAVE,
  SCHEDULE_BLOCK,
  SELECT_ALL,
  VIEW_PROJECT,
  VIEW_TASKS,
} from "./chords";
import { keyPress } from "@/lib/testing/commands";

/**
 * Five of the six chords are Return with a different modifier set, which is what makes the scheme
 * learnable and also what makes it fragile: add one more Return chord that forgets a modifier and
 * it silently shadows a neighbour. `CommandKeys` runs the *first* command whose bindings match, so
 * the loser does not error — it just stops happening, on a keypress the user has been making for
 * months.
 */
const FAMILY: [string, ReturnType<() => KeyEventLike>, typeof INSERT_AFTER][] = [
  ["open", keyPress("Enter"), OPEN_RECORD],
  ["rename", keyPress("Enter", { shiftKey: true }), RENAME],
  ["insert after", keyPress("Enter", { metaKey: true }), INSERT_AFTER],
  [
    "insert before",
    keyPress("Enter", { metaKey: true, shiftKey: true }),
    INSERT_BEFORE,
  ],
  ["insert child", keyPress("Enter", { metaKey: true, altKey: true }), INSERT_CHILD],
  ["delete", keyPress("Backspace"), DELETE_ROW],
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
    expect(matchBindings(keyPress("Insert"), INSERT_AFTER)).toBe(true);
    expect(matchBindings(keyPress("Insert", { shiftKey: true }), INSERT_BEFORE)).toBe(
      true,
    );
    expect(matchBindings(keyPress("Insert", { ctrlKey: true }), INSERT_CHILD)).toBe(
      true,
    );
    expect(matchBindings(keyPress("F2"), RENAME)).toBe(true);
    expect(matchBindings(keyPress("Delete"), DELETE_ROW)).toBe(true);
  });
});

/**
 * The rest of the scheme — movement, clipboard, expand — lives next to the Return family so a
 * rebind changes every menu *and* the outline HintBar in one place. Printing is the
 * contract the HintBar reads; a wrong glyph there is how a scheme change ships half-done.
 */
describe("the shared grid chords", () => {
  it("prints the glyphs the HintBar and menus already teach", () => {
    expect(formatBindings(SELECT_ALL)).toBe("⌘A");
    expect(formatBindings(COPY_AS_TEXT)).toBe("⌘C");
    expect(formatBindings(CUT_ROWS)).toBe("⌘X");
    expect(formatBindings(PASTE_ROWS)).toBe("⌘V");
    expect(formatBindings(MOVE_UP)).toBe("⌥↑");
    expect(formatBindings(MOVE_DOWN)).toBe("⌥↓");
    expect(formatBindings(INDENT)).toBe("Tab");
    expect(formatBindings(OUTDENT)).toBe("⇧Tab");
    expect(formatBindings(EXPAND_SELECTED)).toBe("→");
    expect(formatBindings(COLLAPSE_SELECTED)).toBe("←");
    expect(formatBindings(EXPAND_ALL)).toBe("⌘→");
    expect(formatBindings(COLLAPSE_ALL)).toBe("⌘←");
    expect(formatBindings(COMPLETE)).toBe("⌃L");
    expect(formatBindings(SCHEDULE_BLOCK)).toBe("⌃⌥⇧B");
    expect(formatBindings(VIEW_TASKS)).toBe("⌃T");
    expect(formatBindings(VIEW_PROJECT)).toBe("⌃⇧J");
    expect(formatBindings(SAVE)).toBe("⌘S");
    expect(formatBindings(COMMIT_FORM)).toBe("⌘⏎");
    expect(formatBindings(OPEN_PALETTE)).toBe("⌘K");
    expect(formatBindings(OPEN_FIND)).toBe("⇧⌘F");
    expect(formatBindings(QUICK_CAPTURE)).toBe("C");
    expect(formatBindings(MARKDOWN_BOLD)).toBe("⌘B");
    expect(formatBindings(MARKDOWN_ITALIC)).toBe("⌘I");
  });

  it("keeps form commit and insert-after on the same primary chord", () => {
    // A rebind of one without the other is how a form footer teaches a key that no longer
    // saves — or a create command that steals Save & Close. They share META_ENTER.
    expect(COMMIT_FORM[0]).toBe(INSERT_AFTER[0]);
  });
});
