"use client";

import { createContext } from "react";

/**
 * Whether the Name cell draws the row's type glyph.
 *
 * There is **one** type icon per row, and this decides where it lives. By default it sits
 * beside the name, where it names the thing you are reading. Showing the optional `icon`
 * column moves it into that column instead — Achieve's layout — and this goes false so the
 * two cannot both draw it. Hiding the column hands it straight back.
 *
 * A context rather than a `ColumnDef` prop because it is a fact about the *grid*, not about
 * the name column: the cell has no business knowing which other columns are on screen, and
 * threading it through every tab's column context would make eight files care about a
 * question only `DataGrid` can answer.
 *
 * Defaults to true so any surface rendering a `NameCell` outside a grid keeps the icon.
 */
export const NameIconContext = createContext(true);
