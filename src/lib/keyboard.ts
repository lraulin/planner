/**
 * Shared guards for the document-level keyboard handlers.
 *
 * Every grid installs its own `keydown` listener on `document`, so each one has to decide
 * whether a key belongs to it or to whatever the user is currently typing into. That test
 * was copied into four handlers before it was worth naming.
 */

/** True when the event landed in something the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
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
