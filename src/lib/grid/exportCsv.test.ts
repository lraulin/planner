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
  formatExportStamp,
  gridCopyCommands,
  gridExportCommands,
  gridExportFormatOf,
  serializeGridExport,
  stampExportBody,
  tableToCsv,
  tableToJson,
  tableToMarkdown,
  tableToRecords,
  tableToYaml,
  yamlScalar,
} from "./exportCsv";

/** 13:41:36 Eastern daylight (UTC−4). The suite pins TZ to America/New_York. */
const PINNED = new Date("2026-08-29T17:41:36.000Z");

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

describe("tableToMarkdown", () => {
  it("writes a pipe table with a rule under the header", () => {
    expect(
      tableToMarkdown(columns, [
        { name: "Write brief", note: "due Friday", depth: 0 },
        { name: "Review", note: null, depth: 1 },
      ]),
    ).toBe(
      "| Name | Note |\n| --- | --- |\n| Write brief | due Friday |\n| Review |  |\n",
    );
  });

  it("escapes a pipe and folds a newline into a space", () => {
    // A raw pipe ends the cell and a raw newline ends the row: either one silently
    // reshapes the table into a different one that still renders.
    expect(
      tableToMarkdown(columns, [{ name: "a|b", note: "one\ntwo", depth: 0 }]),
    ).toBe("| Name | Note |\n| --- | --- |\n| a\\|b | one two |\n");
  });

  it("right-aligns only the columns the host marked as money", () => {
    const money = [
      { id: "name", header: "Envelope", value: (row: Row) => row.name },
      {
        id: "amount",
        header: "Assigned",
        value: (row: Row) => row.note ?? "",
        align: "right" as const,
      },
    ];
    expect(tableToMarkdown(money, [])).toBe(
      "| Envelope | Assigned |\n| --- | ---: |\n",
    );
  });

  it("draws depth into the first cell only when the host asks", () => {
    const rows = [
      { name: "Goal", note: null, depth: 0 },
      { name: "Task", note: null, depth: 1 },
    ];
    expect(tableToMarkdown(columns, rows)).toContain("| Task |  |");
    expect(tableToMarkdown(columns, rows, (row) => row.depth)).toContain(
      `| ${"\u00a0".repeat(4)}Task |  |`,
    );
  });

  it("still writes the header when the table is empty", () => {
    expect(tableToMarkdown(columns, [])).toBe("| Name | Note |\n| --- | --- |\n");
  });

  it("returns empty when there is no exportable column", () => {
    expect(tableToMarkdown([], [{ name: "x", note: null, depth: 0 }])).toBe("");
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
  it("stamps the document without changing the table cells", () => {
    const rows = [{ name: "Goal", note: null, depth: 0 }];
    const meta = { title: "Outline", exportedAt: PINNED };
    expect(serializeGridExport("csv", columns, rows, meta)).toBe(
      stampExportBody("csv", {
        title: "Outline",
        exportedAt: PINNED,
        payload: tableToCsv(columns, rows),
      }),
    );
    expect(serializeGridExport("json", columns, rows, meta)).toBe(
      stampExportBody("json", {
        title: "Outline",
        exportedAt: PINNED,
        payload: tableToJson(columns, rows),
      }),
    );
    expect(serializeGridExport("yaml", columns, rows, meta)).toBe(
      stampExportBody("yaml", {
        title: "Outline",
        exportedAt: PINNED,
        payload: tableToYaml(columns, rows),
      }),
    );
    expect(serializeGridExport("markdown", columns, rows, meta)).toBe(
      stampExportBody("markdown", {
        title: "Outline",
        exportedAt: PINNED,
        payload: tableToMarkdown(columns, rows),
      }),
    );
  });
});

describe("formatExportStamp", () => {
  it("writes a local instant with no colons in the filename and an offset in both spellings", () => {
    // Not a UTC calendar date: 17:41Z is still the 29th in New York, but a 22:00 Eastern
    // export would be the next UTC day — the trap `toISOString().slice(0, 10)` falls into.
    expect(formatExportStamp(PINNED)).toEqual({
      filename: "2026-08-29T134136-0400",
      iso: "2026-08-29T13:41:36-04:00",
    });
    expect(formatExportStamp(PINNED).filename).not.toContain(":");
  });
});

describe("exportFilename", () => {
  it("turns the grid label into a safe name with the stamp and the format suffix", () => {
    expect(exportFilename("Outline", "json", PINNED)).toBe(
      "Outline_2026-08-29T134136-0400.json",
    );
    expect(csvFilename("Today's task list", PINNED)).toBe(
      "Today_s_task_list_2026-08-29T134136-0400.csv",
    );
    expect(exportFilename("  Agenda  ", "yaml", PINNED)).toBe(
      "Agenda_2026-08-29T134136-0400.yaml",
    );
    expect(exportFilename("   ", "csv", PINNED)).toBe(
      "grid_2026-08-29T134136-0400.csv",
    );
    expect(exportFilename("Budget — September 2026", "md", PINNED)).toBe(
      "Budget_September_2026_2026-08-29T134136-0400.md",
    );
  });
});

describe("stampExportBody", () => {
  const rows = [{ name: "Goal", note: null, depth: 0 }];

  it("preambles CSV and Markdown and leaves the table itself unstamped", () => {
    const csv = tableToCsv(columns, rows);
    const markdown = tableToMarkdown(columns, rows);
    expect(
      stampExportBody("csv", { title: "Outline", exportedAt: PINNED, payload: csv }),
    ).toBe(`Outline\nExported 2026-08-29T13:41:36-04:00\n\n${csv}`);
    expect(
      stampExportBody("markdown", {
        title: "Outline",
        exportedAt: PINNED,
        payload: markdown,
      }),
    ).toBe(`# Outline\nExported 2026-08-29T13:41:36-04:00\n\n${markdown}`);
    expect(csv.startsWith("Name,Note\n")).toBe(true);
    expect(markdown.startsWith("| Name | Note |")).toBe(true);
  });

  it("wraps JSON and YAML in an envelope; an empty grid is not a top-level array", () => {
    const json = JSON.parse(
      stampExportBody("json", {
        title: "Outline",
        exportedAt: PINNED,
        payload: tableToJson(columns, []),
      }),
    ) as { exportedAt: string; title: string; rows: unknown };
    expect(Array.isArray(json)).toBe(false);
    expect(json).toEqual({
      exportedAt: "2026-08-29T13:41:36-04:00",
      title: "Outline",
      rows: [],
    });
    expect(tableToJson(columns, [])).toBe("[]\n");

    const yaml = stampExportBody("yaml", {
      title: "Outline",
      exportedAt: PINNED,
      payload: tableToYaml(columns, []),
    });
    expect(yaml).toBe(
      'exportedAt: "2026-08-29T13:41:36-04:00"\ntitle: Outline\nrows: []\n',
    );
    expect(tableToYaml(columns, [])).toBe("[]\n");
  });

  it("nests a YAML row list under rows rather than concatenating two documents", () => {
    const payload = tableToYaml(columns, rows);
    expect(
      stampExportBody("yaml", {
        title: "Outline",
        exportedAt: PINNED,
        payload,
      }),
    ).toBe(
      [
        'exportedAt: "2026-08-29T13:41:36-04:00"',
        "title: Outline",
        "rows:",
        "  - Name: Goal",
        '    Note: ""',
        "",
      ].join("\n"),
    );
  });
});

describe("gridExportCommands", () => {
  it("lives in File ▸ Export as a format picker, not on the toolbar or the row menu", () => {
    const commands = gridExportCommands(() => {});
    expect(commands.map((command) => command.label)).toEqual([
      "CSV",
      "JSON",
      "YAML",
      "Markdown",
    ]);
    expect(commands[0]).toMatchObject({
      id: "grid.export-csv",
      menu: "file",
      section: "Export",
      group: "view",
    });
    expect(gridExportFormatOf("grid.export-csv")).toBe("csv");
    expect(gridExportFormatOf("grid.export-markdown")).toBe("markdown");
    expect(commands.every((command) => command.toolbar === undefined)).toBe(true);
    expect(commands.every((command) => command.rowMenu === undefined)).toBe(true);
    expect(unplacedCommands(commands)).toEqual([]);
    expect(toolbarWithoutMenu(commands)).toEqual([]);
  });

  it("folds Export into a submenu after Plan and before Account", () => {
    // Declared taxonomy, not build order — see MENU_SECTIONS.file. Four formats
    // clear the two-command floor, so Export is a fly-out rather than four File rows.
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
      "Markdown",
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
      "Copy Markdown to Clipboard",
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
    expect(gridExportFormatOf("grid.export-markdown")).toBe("markdown");
    expect(gridExportFormatOf("grid.export-xls")).toBeNull();
    // Nothing stamps a scope onto an export id any more — the Budget page was the only
    // dual-grid host and it exports one document now.
    expect(gridExportFormatOf("grid.export-csv.bills")).toBeNull();
  });
});
