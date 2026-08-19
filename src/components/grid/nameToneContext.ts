"use client";

import { createContext } from "react";

/**
 * Which priority a row's **name colour** reads.
 *
 * Outline priority everywhere except the Task Chooser, which ranks the same tasks against
 * each other by a different field (`tc_priority_letter`). Colouring by the outline letter in
 * a list ordered by TC Priority produces a grid that looks sorted wrong — a scan down the
 * names disagrees with a scan down the ranks — because the two answer different questions:
 * one is "how important is this within its project", the other "how important is this
 * against everything I could do right now".
 *
 * A context rather than a prop for the same reason as `NameIconContext`: it is a fact about
 * the grid, and the cell has no business knowing which list it is in.
 *
 * Defaults to the outline, so every surface that renders a `NameCell` without saying keeps
 * the colouring it already had.
 */
export type NameTone = "outline" | "tc";

export const NameToneContext = createContext<NameTone>("outline");
