import type { FocusEvent, MouseEvent } from "react";

/**
 * Select the whole value when a short typed field receives focus, so the next
 * keystroke replaces rather than appends.
 *
 * `select()` on focus is not enough on its own: the mouseup of the click that
 * focused the input places a caret and collapses the selection. Swallowing that
 * mouseup keeps it. A later click while already focused still places a caret
 * (mousedown does that), so editing just the rank of "A1" remains possible.
 */
export const selectValueOnFocus = {
  onFocus: (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  },
  onMouseUp: (event: MouseEvent<HTMLInputElement>) => {
    event.preventDefault();
  },
};
