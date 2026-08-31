/**
 * Shared guards for the document-level keyboard handlers.
 *
 * Every grid installs its own `keydown` listener on `document`, so each one has to decide
 * whether a key belongs to it or to whatever the user is currently typing into. That test
 * was copied into four handlers before it was worth naming.
 */

/** True when the event landed in something the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  // Duck-type rather than `instanceof HTMLElement`: unit tests (and any non-browser
  // call) have no DOM globals, and `x instanceof HTMLElement` throws when the
  // constructor is missing even for `null`.
  if (target == null || typeof target !== "object") return false;
  const el = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    type?: unknown;
  };
  if (typeof el.tagName !== "string") return false;

  if (el.tagName === "INPUT") {
    // Checkboxes and radios are inputs but not typing. Selecting via the gutter
    // then pressing ⌫ used to no-op because every INPUT was treated as a field.
    const type = typeof el.type === "string" ? el.type.toLowerCase() : "text";
    return type !== "checkbox" && type !== "radio";
  }

  return (
    el.tagName === "SELECT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true
  );
}

/**
 * True when a modal dialog is open anywhere on the page.
 *
 * For handlers that live outside the component owning the dialog and so cannot see its
 * state — the app-wide capture shortcut is the only one today. Handlers that own their
 * dialog should check their own state instead of asking the DOM.
 */
export function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}
