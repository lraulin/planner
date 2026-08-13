/**
 * App-wide File-menu commands, as placement data.
 *
 * The `run` closures stay in the client hook (`useGlobalCommands`): they need the router and
 * the capture event. What belongs in `src/lib` is the catalog — which menu, which section,
 * which icon — so a test can fail when someone adds `app.something` without a `menu`.
 *
 * `group: "go"` destinations are deliberately not here. Their visual catalog is the sidebar.
 */

import type { Command, CommandMenu } from "./registry";
import type { CommandIcon } from "./icons";

export type FileCommandPlacement = {
  id: string;
  label: string;
  section: string;
  icon: CommandIcon;
  keywords?: string;
};

export const FILE_COMMAND_PLACEMENTS: readonly FileCommandPlacement[] = [
  {
    id: "app.capture",
    label: "Quick capture",
    section: "Inbox",
    icon: "new",
    keywords: "new task inbox add",
  },
  {
    id: "app.process-inbox",
    label: "Process Inbox",
    section: "Inbox",
    icon: "go-to",
    keywords: "organize triage gtd new tasks",
  },
  {
    id: "app.plan-week",
    label: "Plan Week…",
    section: "Plan",
    icon: "schedule",
    keywords: "weekly planning wizard",
  },
  {
    id: "app.settings",
    label: "Settings",
    section: "Account",
    icon: "settings",
    keywords:
      "options preferences import export achieve rednotebook tomboy google calendar reset backup",
  },
  {
    id: "app.sign-out",
    label: "Sign out",
    section: "Account",
    icon: "sign-out",
  },
];

export const FILE_MENU: CommandMenu = "file";

/**
 * Commands that should have a menu row and do not.
 *
 * `group: "go"` is the one allowed palette extra — destinations live in the sidebar.
 * Everything else without `menu` is a catalog hole.
 */
export function unplacedCommands(commands: readonly Command[]): Command[] {
  return commands.filter(
    (command) => command.group !== "go" && command.menu === undefined,
  );
}

/** A toolbar button that is not also a menu command — the icon row is hidden below `md`. */
export function toolbarWithoutMenu(commands: readonly Command[]): Command[] {
  return commands.filter(
    (command) => command.toolbar !== undefined && command.menu === undefined,
  );
}
