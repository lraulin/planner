/**
 * How the tab strip's button reaches the capture dialog.
 *
 * A custom event rather than shared React state, because `TabStrip` is a server component:
 * a context provider would have to wrap it from outside, which means putting the provider
 * in the root layout and giving it a scope it does not want (the login page). One event on
 * `window` keeps both pieces where they belong.
 */
export const CAPTURE_EVENT = "planner:quick-capture";

export function requestQuickCapture(): void {
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT));
}
