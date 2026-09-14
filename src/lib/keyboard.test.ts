import { describe, expect, it } from "vitest";
import { isComposingKey, isTypingTarget } from "./keyboard";

/** Minimal stand-in for the HTML elements document-level handlers actually see. */
function el(
  tag: string,
  options: { contentEditable?: boolean; type?: string } = {},
): HTMLElement {
  // Node has no real DOM; the guard only uses tagName, type, and isContentEditable.
  return {
    tagName: tag.toUpperCase(),
    type: options.type,
    isContentEditable: options.contentEditable ?? false,
  } as unknown as HTMLElement;
}

describe("isTypingTarget", () => {
  it("returns false for null and non-elements", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });

  it("treats form fields as typing targets", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("input", { type: "text" }))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
  });

  it("does not treat checkboxes or radios as typing targets", () => {
    // The plausible mistake: every INPUT is typing, so ⌫ after a gutter click
    // is swallowed and the row-delete command never fires.
    expect(isTypingTarget(el("input", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("input", { type: "radio" }))).toBe(false);
  });

  it("treats contenteditable as a typing target", () => {
    expect(isTypingTarget(el("div", { contentEditable: true }))).toBe(true);
    expect(isTypingTarget(el("div"))).toBe(false);
  });

  it("leaves ordinary buttons and rows alone", () => {
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(el("tr"))).toBe(false);
  });
});

describe("isComposingKey", () => {
  it("is false for an ordinary keystroke", () => {
    expect(isComposingKey({})).toBe(false);
    expect(isComposingKey({ isComposing: false, keyCode: 13 })).toBe(false);
  });

  it("is true while an IME composition is in progress", () => {
    expect(isComposingKey({ isComposing: true })).toBe(true);
  });

  it("falls back to the legacy keyCode 229 some browsers send instead of isComposing", () => {
    // The plausible mistake: checking only `isComposing` and missing the browsers that
    // signal composition solely through this legacy code on the confirming Enter.
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });
});
