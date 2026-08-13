"use client";

import { useRegisterCommands } from "./CommandProvider";
import { useFileCommands } from "./globalCommands";

/**
 * Publishes the File menu into the command registry.
 *
 * The Commands panel and phone `⋯` read `useCommands()`, not `CommandBar`'s prop list. A File
 * menu that exists only as a local merge would be the exact drift this spec exists to remove:
 * visible on desktop menus, missing from the panel and from the phone.
 *
 * Mounted once in `AppShell`. `CommandBar` still merges the same list this render, because
 * registration is a `setState` and would miss the first paint.
 */
export function FileCommands() {
  useRegisterCommands(useFileCommands());
  return null;
}
