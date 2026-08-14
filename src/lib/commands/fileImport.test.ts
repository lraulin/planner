import { describe, expect, it } from "vitest";
import { buildMenus } from "./menus";
import { unplacedCommands, toolbarWithoutMenu } from "./fileCommands";
import { FILE_IMPORT_SECTION, fileImportCommand } from "./fileImport";
import type { Command } from "./registry";

function command(id: string, extra: Partial<Command> = {}): Command {
  return { id, label: id, group: "record", run: () => {}, ...extra };
}

describe("fileImportCommand", () => {
  it("lives in File ▸ Import, not on the toolbar or the row menu", () => {
    const importCommand = fileImportCommand({
      id: "import.finance",
      label: "Import transactions…",
      keywords: "csv statement bank",
      run: () => {},
    });
    expect(importCommand).toMatchObject({
      id: "import.finance",
      menu: "file",
      section: FILE_IMPORT_SECTION,
      group: "view",
      icon: "import",
    });
    expect(importCommand.toolbar).toBeUndefined();
    expect(importCommand.rowMenu).toBeUndefined();
    expect(unplacedCommands([importCommand])).toEqual([]);
    expect(toolbarWithoutMenu([importCommand])).toEqual([]);
  });

  it("sits between Plan and Export and does not nest a lone importer", () => {
    const file = buildMenus([
      command("app.capture", { menu: "file", section: "Inbox" }),
      command("app.plan-week", { menu: "file", section: "Plan" }),
      fileImportCommand({
        id: "import.achieve",
        label: "Import Achieve XML…",
        keywords: "achieve xml",
        run: () => {},
      }),
      command("grid.export-csv", { menu: "file", section: "Export" }),
      command("grid.export-json", { menu: "file", section: "Export" }),
      command("app.settings", { menu: "file", section: "Account" }),
    ]).find((menu) => menu.id === "file");

    expect(
      file?.sections.map((section) => [section.label, section.submenu === true]),
    ).toEqual([
      ["Inbox", false],
      ["Plan", false],
      ["Import", false],
      ["Export", true],
      ["Account", false],
    ]);
    expect(file?.sections[2].commands.map((entry) => entry.label)).toEqual([
      "Import Achieve XML…",
    ]);
  });
});
