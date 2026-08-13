import { describe, expect, it } from "vitest";
import { buildMenus, overflowMenus } from "./menus";
import {
  FILE_COMMAND_PLACEMENTS,
  FILE_MENU,
  unplacedCommands,
  toolbarWithoutMenu,
} from "./fileCommands";
import type { Command } from "./registry";

function command(id: string, extra: Partial<Command> = {}): Command {
  return { id, label: id, group: "record", run: () => {}, ...extra };
}

function fileCommands(): Command[] {
  return FILE_COMMAND_PLACEMENTS.map((placement) => ({
    ...placement,
    group: "app" as const,
    menu: FILE_MENU,
    run: () => {},
  }));
}

describe("FILE_COMMAND_PLACEMENTS", () => {
  it("puts every app-wide verb in File, with no duplicates", () => {
    const ids = FILE_COMMAND_PLACEMENTS.map((row) => row.id);
    expect(ids).toEqual([
      "app.capture",
      "app.process-inbox",
      "app.plan-week",
      "app.settings",
      "app.sign-out",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is the leftmost menu when mixed with a view's commands", () => {
    const menus = buildMenus([
      ...fileCommands(),
      command("new-task", { menu: "new", section: "New" }),
    ]);
    expect(menus.map((menu) => menu.id)).toEqual(["file", "new"]);
  });

  it("keeps File on the phone overflow, because there is no command row down there", () => {
    const ids = overflowMenus(fileCommands()).flatMap((menu) =>
      menu.sections.flatMap((section) => section.commands.map((entry) => entry.id)),
    );
    expect(ids).toEqual([
      "app.capture",
      "app.process-inbox",
      "app.plan-week",
      "app.settings",
      "app.sign-out",
    ]);
  });
});

describe("unplacedCommands", () => {
  it("reports a non-go command that forgot its menu", () => {
    expect(unplacedCommands([command("app.forgot")]).map((entry) => entry.id)).toEqual([
      "app.forgot",
    ]);
  });

  it("lets go-to destinations stay palette extras", () => {
    expect(unplacedCommands([command("go.plan", { group: "go" })])).toEqual([]);
  });

  it("is empty for the File catalog itself", () => {
    expect(unplacedCommands(fileCommands())).toEqual([]);
  });
});

describe("toolbarWithoutMenu", () => {
  it("catches an icon-row command that is not also in a menu", () => {
    expect(
      toolbarWithoutMenu([command("orphan", { toolbar: 10 })]).map((entry) => entry.id),
    ).toEqual(["orphan"]);
  });

  it("accepts a toolbar command that named its menu", () => {
    expect(toolbarWithoutMenu([command("new", { menu: "new", toolbar: 10 })])).toEqual(
      [],
    );
  });
});
