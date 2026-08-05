/**
 * How the shell's capture buttons reach the capture dialog.
 *
 * A custom event rather than shared React state, because the dialog and the buttons that
 * open it are siblings, not ancestor and descendant: a context provider would have to wrap
 * both from outside, which means putting it in the root layout and giving it a scope it does
 * not want (the login page). One event on `window` keeps every piece where it belongs.
 *
 * `shell/commandEvent.ts` is the same pattern for the same reason.
 */
export const CAPTURE_EVENT = "planner:quick-capture";

export function requestQuickCapture(): void {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT));
}
