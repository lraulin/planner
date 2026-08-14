import { describe, expect, it } from "vitest";
import { parseCsvRows } from "@/lib/csv/text";
import { unplacedCommands, toolbarWithoutMenu } from "@/lib/commands/fileCommands";
import { buildMenus } from "@/lib/commands/menus";
import {
  copyClipboardLabel,
  csvFilename,
  exportableColumns,
  exportCellText,
  exportFilename,
  gridCopyCommands,
  gridExportCommands,
  gridExportFormatOf,
  serializeGridExport,
  tableToCsv,
  tableToJson,
  tableToRecords,
  tableToYaml,
  yamlScalar,
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

type Row = { name: string; note: string | null; depth: number };
const columns = exportableColumns<Row>([
  { id: "name", label: "Name", filterValue: (row) => row.name },
  { id: "note", label: "Note", filterValue: (row) => row.note },
]);

describe("tableToCsv", () => {
  it("writes a header and one line per row, then a trailing newline", () => {
    const csv = tableToCsv(columns, [
      { name: "Write brief", note: "due Friday", depth: 0 },
      { name: "Review", note: null, depth: 1 },
    ]);
    expect(csv).toBe("Name,Note\nWrite brief,due Friday\nReview,\n");
  });

  it("quotes commas, quotes, and newlines so the document round-trips", () => {
    const csv = tableToCsv(columns, [{ name: 'Say "hi"', note: "a,b\nc", depth: 0 }]);
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
    expect(tableToCsv([], [{ name: "x", note: null, depth: 0 }])).toBe("");
  });

  it("stays flat when the rows have depth", () => {
    // CSV cannot nest. A child is another line, not a cell.
    const csv = tableToCsv(columns, [
      { name: "Goal", note: null, depth: 0 },
      { name: "Task", note: null, depth: 1 },
    ]);
    expect(csv).toBe("Name,Note\nGoal,\nTask,\n");
  });
});

describe("tableToRecords", () => {
  it("nests descendants under children and omits the key on a leaf", () => {
    expect(
      tableToRecords(columns, [
        { name: "Goal", note: "q1", depth: 0 },
        { name: "Task", note: null, depth: 1 },
        { name: "Peer", note: "also", depth: 0 },
      ]),
    ).toEqual([
      {
        Name: "Goal",
        Note: "q1",
        children: [{ Name: "Task", Note: "" }],
      },
      { Name: "Peer", Note: "also" },
    ]);
  });

  it("stays a flat list when every row is a root", () => {
    expect(
      tableToRecords(columns, [
        { name: "Rent", note: null, depth: 0 },
        { name: "Groceries", note: null, depth: 0 },
      ]),
    ).toEqual([
      { Name: "Rent", Note: "" },
      { Name: "Groceries", Note: "" },
    ]);
  });
});

describe("tableToJson", () => {
  it("pretty-prints the nested records", () => {
    expect(
      tableToJson(columns, [
        { name: "Goal", note: null, depth: 0 },
        { name: "Task", note: null, depth: 1 },
      ]),
    ).toBe(
      `${JSON.stringify(
        [{ Name: "Goal", Note: "", children: [{ Name: "Task", Note: "" }] }],
        null,
        2,
      )}\n`,
    );
  });

  it("writes an empty array when the grid is empty", () => {
    expect(tableToJson(columns, [])).toBe("[]\n");
  });
});

describe("yamlScalar", () => {
  it("leaves a plain word bare and quotes anything YAML would misread", () => {
    expect(yamlScalar("Write brief")).toBe("Write brief");
    expect(yamlScalar("")).toBe('""');
    expect(yamlScalar("true")).toBe('"true"');
    expect(yamlScalar("12")).toBe('"12"');
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar("say #1")).toBe('"say #1"');
  });
});

describe("tableToYaml", () => {
  it("writes a list of maps with nested children", () => {
    expect(
      tableToYaml(columns, [
        { name: "Goal", note: "q1", depth: 0 },
        { name: "Task", note: null, depth: 1 },
        { name: "Step", note: "do", depth: 2 },
        { name: "Peer", note: "also", depth: 0 },
      ]),
    ).toBe(
      [
        "- Name: Goal",
        "  Note: q1",
        "  children:",
        "    - Name: Task",
        '      Note: ""',
        "      children:",
        "        - Name: Step",
        "          Note: do",
        "- Name: Peer",
        "  Note: also",
        "",
      ].join("\n"),
    );
  });

  it("writes an empty array when the grid is empty", () => {
    expect(tableToYaml(columns, [])).toBe("[]\n");
  });
});

describe("serializeGridExport", () => {
  it("dispatches on the format without changing the cells", () => {
    const rows = [{ name: "Goal", note: null, depth: 0 }];
    expect(serializeGridExport("csv", columns, rows)).toBe(tableToCsv(columns, rows));
    expect(serializeGridExport("json", columns, rows)).toBe(tableToJson(columns, rows));
    expect(serializeGridExport("yaml", columns, rows)).toBe(tableToYaml(columns, rows));
  });
});

describe("exportFilename", () => {
  it("turns the grid label into a safe name with the format suffix", () => {
    expect(csvFilename("Today's task list")).toBe("Today_s_task_list.csv");
    expect(exportFilename("Today's task list", "json")).toBe("Today_s_task_list.json");
    expect(exportFilename("  Agenda  ", "yaml")).toBe("Agenda.yaml");
    expect(exportFilename("   ", "csv")).toBe("grid.csv");
  });
});

describe("gridExportCommands", () => {
  it("lives in File ▸ Export as a format picker, not on the toolbar or the row menu", () => {
    const commands = gridExportCommands(() => {});
    expect(commands.map((command) => command.label)).toEqual(["CSV", "JSON", "YAML"]);
    expect(commands[0]).toMatchObject({
      id: "grid.export-csv",
      menu: "file",
      section: "Export",
      group: "view",
    });
    expect(commands.every((command) => command.toolbar === undefined)).toBe(true);
    expect(commands.every((command) => command.rowMenu === undefined)).toBe(true);
    expect(unplacedCommands(commands)).toEqual([]);
    expect(toolbarWithoutMenu(commands)).toEqual([]);
  });

  it("folds Export into a submenu after Plan and before Account", () => {
    // Declared taxonomy, not build order — see MENU_SECTIONS.file. Three formats
    // clear the two-command floor, so Export is a fly-out rather than three File rows.
    const file = buildMenus([
      {
        id: "app.sign-out",
        label: "Sign out",
        group: "app",
        menu: "file",
        section: "Account",
        run: () => {},
      },
      ...gridExportCommands(() => {}),
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

    expect(
      file?.sections.map((section) => [section.label, section.submenu === true]),
    ).toEqual([
      ["Inbox", false],
      ["Plan", false],
      ["Export", true],
      ["Account", false],
    ]);
    expect(file?.sections[2].commands.map((command) => command.label)).toEqual([
      "CSV",
      "JSON",
      "YAML",
    ]);
  });

  it("offers Option-held copy as an alternate on each download row", () => {
    // Finder rewrites the row. The permanent Copy to Clipboard family is the
    // discoverable twin; this is the accelerator.
    const [csv] = gridExportCommands(() => {});
    expect(csv.alternate).toMatchObject({
      label: "Copy CSV to Clipboard",
      title: "Copy the current view as CSV to the clipboard",
    });
    expect(copyClipboardLabel("json")).toBe("Copy JSON to Clipboard");
  });
});

describe("gridCopyCommands", () => {
  it("lives in File ▸ Copy to Clipboard, not on the toolbar or the row menu", () => {
    const commands = gridCopyCommands(() => {});
    expect(commands.map((command) => command.label)).toEqual([
      "Copy CSV to Clipboard",
      "Copy JSON to Clipboard",
      "Copy YAML to Clipboard",
    ]);
    expect(commands[0]).toMatchObject({
      id: "grid.copy-csv",
      menu: "file",
      section: "Copy to Clipboard",
      group: "view",
    });
    expect(commands.every((command) => command.toolbar === undefined)).toBe(true);
    expect(unplacedCommands(commands)).toEqual([]);
    expect(toolbarWithoutMenu(commands)).toEqual([]);
  });

  it("folds next to Export, after Plan and before Account", () => {
    const file = buildMenus([
      ...gridExportCommands(() => {}),
      ...gridCopyCommands(() => {}),
      {
        id: "app.plan-week",
        label: "Plan Week…",
        group: "app",
        menu: "file",
        section: "Plan",
        run: () => {},
      },
      {
        id: "app.sign-out",
        label: "Sign out",
        group: "app",
        menu: "file",
        section: "Account",
        run: () => {},
      },
    ]).find((menu) => menu.id === "file");

    expect(
      file?.sections.map((section) => [section.label, section.submenu === true]),
    ).toEqual([
      ["Plan", false],
      ["Export", true],
      ["Copy to Clipboard", true],
      ["Account", false],
    ]);
  });
});

describe("gridExportFormatOf", () => {
  it("reads the format off either family of ids", () => {
    expect(gridExportFormatOf("grid.export-yaml")).toBe("yaml");
    expect(gridExportFormatOf("grid.copy-json")).toBe("json");
    expect(gridExportFormatOf("grid.export-xls")).toBeNull();
  });
});
