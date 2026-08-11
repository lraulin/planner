import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./keyboard";

/** Minimal stand-in for the HTML elements document-level handlers actually see. */
function el(tag: string, options: { contentEditable?: boolean } = {}): HTMLElement {
  // Node has no real DOM; the guard only uses tagName and isContentEditable.
  return {
    tagName: tag.toUpperCase(),
    isContentEditable: options.contentEditable ?? false,
  } as HTMLElement;
}

describe("isTypingTarget", () => {
  it("returns false for null and non-elements", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });

  it("treats form fields as typing targets", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
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
