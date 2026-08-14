import { describe, expect, it } from "vitest";
import { parseCsvRows } from "@/lib/csv/text";
import { unplacedCommands, toolbarWithoutMenu } from "@/lib/commands/fileCommands";
import { buildMenus } from "@/lib/commands/menus";
import {
  csvFilename,
  exportableColumns,
  exportCellText,
  gridExportCsvCommand,
  tableToCsv,
} from "./exportCsv";

describe("exportCellText", () => {
  it("prefers compact text over the filter value", () => {
    expect(
      exportCellText(
        {
          compactText: () => "2 h",
          filterValue: () => "120",
        },
        {},
      ),
    ).toBe("2 h");
  });

  it("runs a filter value through filterLabel so codes read as words", () => {
    // A State cell stores NS; the chip and the set-filter say "Not started". Exporting
    // the code would look like a different column than the one on screen.
    expect(
      exportCellText(
        {
          filterValue: () => "NS",
          filterLabel: (value) => (value === "NS" ? "Not started" : value),
        },
        {},
      ),
    ).toBe("Not started");
  });

  it("treats a missing or blank filter value as an empty cell", () => {
    expect(exportCellText({ filterValue: () => null }, {})).toBe("");
    expect(exportCellText({ filterValue: () => "" }, {})).toBe("");
    expect(exportCellText({}, {})).toBe("");
  });
});

describe("exportableColumns", () => {
  it("skips a column the grid cannot turn into text", () => {
    const columns = exportableColumns([
      { id: "name", label: "Name", filterValue: (row: { name: string }) => row.name },
      { id: "handle", label: " " },
    ]);
    expect(columns.map((column) => column.id)).toEqual(["name"]);
  });
});

describe("tableToCsv", () => {
  type Row = { name: string; note: string | null };
  const columns = exportableColumns<Row>([
    { id: "name", label: "Name", filterValue: (row) => row.name },
    { id: "note", label: "Note", filterValue: (row) => row.note },
  ]);

  it("writes a header and one line per row, then a trailing newline", () => {
    const csv = tableToCsv(columns, [
      { name: "Write brief", note: "due Friday" },
      { name: "Review", note: null },
    ]);
    expect(csv).toBe("Name,Note\nWrite brief,due Friday\nReview,\n");
  });

  it("quotes commas, quotes, and newlines so the document round-trips", () => {
    const csv = tableToCsv(columns, [{ name: 'Say "hi"', note: "a,b\nc" }]);
    expect(parseCsvRows(csv)).toEqual([
      ["Name", "Note"],
      ['Say "hi"', "a,b\nc"],
    ]);
  });

  it("still downloads a header when the grid is empty", () => {
    // A template you can fill and re-import. Matching itemsToCsv.
    expect(tableToCsv(columns, [])).toBe("Name,Note\n");
  });

  it("returns empty when there is no exportable column", () => {
    expect(tableToCsv([], [{ name: "x" }])).toBe("");
  });
});

describe("csvFilename", () => {
  it("turns the grid label into a safe .csv name", () => {
    expect(csvFilename("Today's task list")).toBe("Today_s_task_list.csv");
    expect(csvFilename("  Agenda  ")).toBe("Agenda.csv");
    expect(csvFilename("   ")).toBe("grid.csv");
  });
});

describe("gridExportCsvCommand", () => {
  it("lives in File ▸ Export, not on the toolbar or the row menu", () => {
    const command = gridExportCsvCommand(() => {});
    expect(command).toMatchObject({
      id: "grid.export-csv",
      label: "Export as CSV",
      menu: "file",
      section: "Export",
      group: "view",
    });
    expect(command.toolbar).toBeUndefined();
    expect(command.rowMenu).toBeUndefined();
    expect(unplacedCommands([command])).toEqual([]);
    expect(toolbarWithoutMenu([command])).toEqual([]);
  });

  it("sits in File after Plan and before Account", () => {
    // Declared taxonomy, not build order — see MENU_SECTIONS.file.
    const file = buildMenus([
      {
        id: "app.sign-out",
        label: "Sign out",
        group: "app",
        menu: "file",
        section: "Account",
        run: () => {},
      },
      gridExportCsvCommand(() => {}),
      {
        id: "app.capture",
        label: "Quick capture",
        group: "app",
        menu: "file",
        section: "Inbox",
        run: () => {},
      },
      {
        id: "app.plan-week",
        label: "Plan Week…",
        group: "app",
        menu: "file",
        section: "Plan",
        run: () => {},
      },
    ]).find((menu) => menu.id === "file");

    expect(file?.sections.map((section) => section.label)).toEqual([
      "Inbox",
      "Plan",
      "Export",
      "Account",
    ]);
  });
});
