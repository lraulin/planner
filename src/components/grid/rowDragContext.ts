"use client";

import { createContext, type DragEvent } from "react";

/**
 * API a row exposes to its drag handles (left gutter, type icon).
 *
 * Handles are the HTML5 drag sources themselves — permanently `draggable` while this
 * context is non-null. Arming the *row* on mousedown is too late: the browser has already
 * decided the gesture is text selection. Drop targets stay on the row.
 */
export type RowDragHandleApi = {
  onHandleMouseDown: () => void;
  onDragStart: (event: DragEvent) => void;
};

export const RowDragHandleContext = createContext<RowDragHandleApi | null>(null);
