import { describe, expect, it } from "vitest";
import {
  formatBinding,
  formatBindings,
  matchBinding,
  matchBindings,
  type KeyBinding,
  type KeyEventLike,
} from "./bindings";

function press(key: string, held: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...held,
  };
}

describe("matchBinding", () => {
  it("treats ⌘ and Ctrl as the same modifier", () => {
    // Every hand-written handler in the app did `metaKey || ctrlKey`, because the app runs on
    // both kinds of keyboard and `⌘C` has to mean Ctrl+C on Windows.
    const copy: KeyBinding = { key: "c", meta: true };
    expect(matchBinding(press("c", { metaKey: true }), copy)).toBe(true);
    expect(matchBinding(press("c", { ctrlKey: true }), copy)).toBe(true);
    expect(matchBinding(press("c"), copy)).toBe(false);
  });

  it("matches a single character whichever case the event reports", () => {
    // Holding Shift is a different chord, but `⌘C` arrives as `"c"` or `"C"` depending on
    // caps lock, and caps lock is not a modifier anyone is choosing to press.
    const copy: KeyBinding = { key: "c", meta: true };
    expect(matchBinding(press("C", { metaKey: true }), copy)).toBe(true);
  });

  /*
   * The one that would silently break three commands. `Insert`, `⇧Insert` and `⌃Insert` are
   * insert-after, insert-before and insert-as-child. A binding that ignored modifiers it did not
   * name would make plain Insert fire on all three, and which one won would depend on the order
   * the dispatcher happened to test them in.
   */
  it("requires the modifiers it does not name to be *up*", () => {
    const after: KeyBinding = { key: "Insert" };
    expect(matchBinding(press("Insert"), after)).toBe(true);
    expect(matchBinding(press("Insert", { shiftKey: true }), after)).toBe(false);
    expect(matchBinding(press("Insert", { ctrlKey: true }), after)).toBe(false);
    expect(matchBinding(press("Insert", { altKey: true }), after)).toBe(false);
  });

  it("keeps the three insert chords apart", () => {
    const before: KeyBinding = { key: "Insert", shift: true };
    const child: KeyBinding = { key: "Insert", ctrl: true };

    expect(matchBinding(press("Insert", { shiftKey: true }), before)).toBe(true);
    expect(matchBinding(press("Insert", { ctrlKey: true }), before)).toBe(false);
    expect(matchBinding(press("Insert", { ctrlKey: true }), child)).toBe(true);
    expect(matchBinding(press("Insert", { shiftKey: true }), child)).toBe(false);
  });

  it("does not let Ctrl stand in for ⌘ when the chord wants both", () => {
    // `meta` accepts either ⌘ or Ctrl, so a chord naming *both* has to demand both keys — or
    // plain Ctrl+Return would fire it, and the user who meant "new sibling" would get whatever
    // the two-modifier chord does.
    const child: KeyBinding = { key: "Enter", meta: true, ctrl: true };
    expect(matchBinding(press("Enter", { metaKey: true, ctrlKey: true }), child)).toBe(
      true,
    );
    expect(matchBinding(press("Enter", { ctrlKey: true }), child)).toBe(false);
    expect(matchBinding(press("Enter", { metaKey: true }), child)).toBe(false);
  });

  it("keeps a plain key from firing while the command modifier is down", () => {
    // ⌘← is collapse-all in the outline, ← is collapse-selected. Two commands, two rows.
    const collapse: KeyBinding = { key: "ArrowLeft" };
    expect(matchBinding(press("ArrowLeft"), collapse)).toBe(true);
    expect(matchBinding(press("ArrowLeft", { metaKey: true }), collapse)).toBe(false);
  });

  it("distinguishes Tab from ⇧Tab", () => {
    expect(matchBinding(press("Tab"), { key: "Tab" })).toBe(true);
    expect(matchBinding(press("Tab", { shiftKey: true }), { key: "Tab" })).toBe(false);
    expect(
      matchBinding(press("Tab", { shiftKey: true }), { key: "Tab", shift: true }),
    ).toBe(true);
  });
});

describe("matchBindings", () => {
  it("fires on any of a command's chords", () => {
    // Apple keyboards have no Insert key, so ⌘⏎ replaced it — Insert still fires on a full one.
    const insertAfter: KeyBinding[] = [{ key: "Enter", meta: true }, { key: "Insert" }];
    expect(matchBindings(press("Insert"), insertAfter)).toBe(true);
    expect(matchBindings(press("Enter", { metaKey: true }), insertAfter)).toBe(true);
    expect(matchBindings(press("Enter"), insertAfter)).toBe(false);
  });

  it("is false for a command with no bindings at all", () => {
    expect(matchBindings(press("a"), undefined)).toBe(false);
    expect(matchBindings(press("a"), [])).toBe(false);
  });
});

describe("formatBinding", () => {
  /*
   * The exact vocabulary the app printed before bindings existed. These strings are on screen in
   * menus, the panel, the palette and the outline's hint bar, so a change here is a change to what
   * the user reads — it should have to be deliberate.
   */
  it("prints the app's existing shortcut vocabulary", () => {
    const cases: [KeyBinding, string][] = [
      [{ key: "Enter" }, "⏎"],
      [{ key: "F2" }, "F2"],
      [{ key: "c", meta: true }, "⌘C"],
      [{ key: "Delete" }, "Delete"],
      // The MacBook key labelled *delete*. It prints as its glyph, not as "Backspace".
      [{ key: "Backspace" }, "⌫"],
      [{ key: "Insert" }, "Insert"],
      [{ key: "Insert", shift: true }, "⇧Insert"],
      [{ key: "Insert", ctrl: true }, "⌃Insert"],
      [{ key: "ArrowUp", alt: true }, "⌥↑"],
      [{ key: "ArrowDown", alt: true }, "⌥↓"],
      [{ key: "ArrowLeft" }, "←"],
      [{ key: "ArrowRight" }, "→"],
      [{ key: "Tab" }, "Tab"],
      [{ key: "Tab", shift: true }, "⇧Tab"],
    ];

    for (const [binding, printed] of cases) {
      expect(formatBinding(binding), JSON.stringify(binding)).toBe(printed);
    }
  });

  it("orders modifiers ⌃⌥⇧⌘, the way macOS and Achieve both printed them", () => {
    expect(
      formatBinding({ key: "k", meta: true, shift: true, alt: true, ctrl: true }),
    ).toBe("⌃⌥⇧⌘K");
  });

  it("prints the first binding, since that is the chord being taught", () => {
    expect(formatBindings([{ key: "Enter", meta: true }, { key: "Insert" }])).toBe(
      "⌘⏎",
    );
    expect(formatBindings(undefined)).toBeUndefined();
    expect(formatBindings([])).toBeUndefined();
  });
});
