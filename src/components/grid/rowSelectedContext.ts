"use client";

import { createContext, useContext } from "react";

/**
 * Whether the row currently rendering a cell is selected / focused.
 *
 * Selection used to live on every column context object. That rebuilt `columnCtx` on every
 * arrow-key move and forced every cell to re-render. The grid paints selection on the row
 * shell; cells that need "selected" chrome (the open-detail affordance) read it here so
 * only the rows whose selected flag actually changed re-render under `React.memo`.
 */
export const RowSelectedContext = createContext(false);

export function useRowSelected(): boolean {
  return useContext(RowSelectedContext);
}
