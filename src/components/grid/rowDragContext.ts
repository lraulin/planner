"use client";

import { createContext } from "react";

/**
 * True while the surrounding desktop grid is accepting row drag. Handles (left gutter,
 * type icon) read this so they can be permanently `draggable` — HTML5 drag only starts if
 * the source was already draggable at mousedown, so arming the row on press is too late
 * and the browser falls through to text selection instead.
 */
export const RowDragActiveContext = createContext(false);
