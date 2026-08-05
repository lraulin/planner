/**
 * How a button reaches the command palette.
 *
 * Same shape and the same reason as `capture/event.ts`: the palette owns its own open
 * state, and the buttons that open it (the sidebar's Search row, the phone's More sheet)
 * are not its children. An event on `window` beats hoisting that state into a provider
 * whose only job would be a boolean.
 *
 * `⌘K` itself is a document listener inside the palette, not a dispatch of this — the
 * shortcut needs the typing-target and open-dialog guards, and those belong with the
 * component that knows what it is doing.
 */
export const COMMAND_PALETTE_EVENT = "planner:command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
}
