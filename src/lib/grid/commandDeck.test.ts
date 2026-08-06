import { describe, expect, it } from "vitest";
import { buildGridCommands } from "./commandDeck";
import { formatBindings } from "@/lib/commands/bindings";
import {
  buildMenus,
  rowMenuSections,
  toolbarCommands,
  toolbarSegments,
} from "@/lib/commands/menus";

describe("grid command deck", () => {
  it("keeps selection commands visible but explains why they are disabled", () => {
    const commands = buildGridCommands({
      createKinds: ["task"],
      hierarchy: true,
      selection: { id: null },
      actions: {
        onCreate: () => {},
        onOpen: () => {},
        onRename: () => {},
        onDelete: () => {},
      },
    });

    expect(commands.find((entry) => entry.id === "record.open")).toMatchObject({
      disabled: true,
      title: "Select a row first",
    });
    expect(commands.find((entry) => entry.id === "grid.create.child")).toMatchObject({
      disabled: true,
    });
  });

  it("promotes the frequent actions to the command row, in reading order", () => {
    const commands = buildGridCommands({
      createKinds: ["task"],
      hierarchy: true,
      selection: { id: "task-1", count: 1, canMoveUp: true, canMoveDown: false },
      actions: {
        onCreate: () => {},
        onOpen: () => {},
        onRename: () => {},
        onCopyAsText: () => {},
        onMoveUp: () => {},
        onMoveDown: () => {},
        onIndent: () => {},
        onOutdent: () => {},
        onExpandAll: () => {},
        onCollapseAll: () => {},
      },
    });

    expect(toolbarCommands(commands).map((entry) => entry.id)).toEqual([
      "grid.create",
      "grid.create.before",
      "grid.create.after",
      "grid.create.child",
      "record.move-up",
      "record.move-down",
      "record.indent",
      "record.outdent",
      "record.open",
      "record.rename",
    ]);

    // The hairlines: create | insert | move | indent | item verbs.
    expect(toolbarSegments(commands).map((segment) => segment.length)).toEqual([
      1, 3, 2, 2, 2,
    ]);

    // Everything else stays a menu row — including the ones with no visible button, which is
    // the whole reason the menus have to be complete.
    expect(toolbarCommands(commands).map((entry) => entry.id)).not.toContain(
      "record.copy-as-text",
    );
  });

  it("files every command under a menu and a section", () => {
    // A grid command with no menu has no visible path on a phone, which `navigation.md` rules
    // out. This is the tripwire for forgetting the placement on a new command.
    const commands = buildGridCommands({
      createKinds: ["task"],
      hierarchy: true,
      priorityMaintenance: true,
      conversionKinds: ["project", "task"],
      outlineZoom: true,
      selection: { id: "task-1" },
      actions: {
        onCreate: () => {},
        onOpen: () => {},
        onRename: () => {},
        onDelete: () => {},
        onCopyAsText: () => {},
        onMoveUp: () => {},
        onMoveDown: () => {},
        onIndent: () => {},
        onOutdent: () => {},
        onExpand: () => {},
        onCollapse: () => {},
        onExpandAll: () => {},
        onCollapseAll: () => {},
        onChooseExpandThroughLevel: () => {},
        onRemovePriorityGaps: () => {},
        onReprioritizeUnique: () => {},
        onConvert: () => {},
        onZoomIn: () => {},
        onZoomOut: () => {},
        onClearZoom: () => {},
        onZoomToItem: () => {},
      },
    });

    for (const entry of commands) {
      expect(entry.menu, `${entry.id} has no menu`).toBeTruthy();
      expect(entry.section, `${entry.id} has no section`).toBeTruthy();
      expect(entry.icon, `${entry.id} has no icon`).toBeTruthy();
    }

    expect(buildMenus(commands).map((menu) => menu.id)).toEqual([
      "new",
      "item",
      "organize",
    ]);

    // The Outline's full row menu: item verbs first, creation next, restructuring after, Delete
    // last wherever it appears.
    expect(rowMenuSections(commands).map((section) => section.label)).toEqual([
      "Item",
      "Insert row",
      "Move",
      "Expand",
      "Priority",
      "Zoom",
      "Danger",
    ]);
  });

  it("prints the shortcut the binding actually fires", () => {
    // The vocabulary the app showed before bindings existed, now derived rather than typed.
    const commands = buildGridCommands({
      createKinds: ["task"],
      hierarchy: true,
      selection: { id: "task-1", canExpand: true },
      actions: {
        onCreate: () => {},
        onOpen: () => {},
        onRename: () => {},
        onDelete: () => {},
        onCopyAsText: () => {},
        onMoveUp: () => {},
        onIndent: () => {},
        onOutdent: () => {},
        onExpand: () => {},
      },
    });

    const printed = new Map(
      commands.map((entry) => [entry.id, formatBindings(entry.bindings)]),
    );

    expect(printed.get("record.open")).toBe("⏎");
    expect(printed.get("record.rename")).toBe("F2");
    expect(printed.get("record.copy-as-text")).toBe("⌘C");
    expect(printed.get("record.delete")).toBe("Delete");
    expect(printed.get("record.move-up")).toBe("⌥↑");
    expect(printed.get("record.indent")).toBe("Tab");
    expect(printed.get("record.outdent")).toBe("⇧Tab");
    expect(printed.get("grid.create.before")).toBe("⇧Insert");
    expect(printed.get("grid.create.after")).toBe("Insert");
    expect(printed.get("grid.create.child")).toBe("⌃Insert");
    expect(printed.get("record.expand-collapse")).toBe("→");
  });

  // `canCollapse` means the row is currently expanded, so the useful verb is Collapse.
  // Reading it as "the row is collapsed" makes the command call the toggle that is already
  // in effect, which looks like a dead menu item rather than a mislabelled one.
  it("offers the verb that would actually change an expanded row", () => {
    const calls: string[] = [];
    const commands = buildGridCommands({
      hierarchy: true,
      selection: { id: "node-1", canExpand: false, canCollapse: true },
      actions: {
        onExpand: () => calls.push("expand"),
        onCollapse: () => calls.push("collapse"),
      },
    });

    const toggle = commands.find((entry) => entry.id === "record.expand-collapse");
    expect(toggle).toMatchObject({ label: "Collapse selected", icon: "collapse" });
    expect(formatBindings(toggle?.bindings)).toBe("←");
    toggle?.run();
    expect(calls).toEqual(["collapse"]);
  });

  it("offers the verb that would actually change a collapsed row", () => {
    const calls: string[] = [];
    const commands = buildGridCommands({
      hierarchy: true,
      selection: { id: "node-1", canExpand: true, canCollapse: false },
      actions: {
        onExpand: () => calls.push("expand"),
        onCollapse: () => calls.push("collapse"),
      },
    });

    const toggle = commands.find((entry) => entry.id === "record.expand-collapse");
    expect(toggle).toMatchObject({ label: "Expand selected", icon: "expand" });
    expect(formatBindings(toggle?.bindings)).toBe("→");
    toggle?.run();
    expect(calls).toEqual(["expand"]);
  });

  // Both hosts pass the selected id straight to the server action and do nothing without
  // one, so an enabled control here is a click that silently achieves nothing.
  it("explains that priority repair needs a row to name the sibling group", () => {
    const commands = buildGridCommands({
      priorityMaintenance: true,
      selection: { id: null },
      actions: { onRemovePriorityGaps: () => {}, onReprioritizeUnique: () => {} },
    });

    for (const commandId of [
      "record.remove-priority-gaps",
      "record.reprioritize-unique",
    ]) {
      expect(commands.find((entry) => entry.id === commandId)).toMatchObject({
        disabled: true,
        title: "Select a row first",
      });
    }
  });

  it("will not convert a row to the kind it already is", () => {
    let converted: string | null = null;
    const commands = buildGridCommands({
      conversionKinds: ["project", "task"],
      selection: { id: "node-1", kind: "project" },
      actions: { onConvert: (_id, kind) => (converted = kind) },
    });

    const toProject = commands.find((entry) => entry.id === "record.convert.project");
    expect(toProject).toMatchObject({ disabled: true, title: "Already a Project" });
    toProject?.run();
    expect(converted).toBeNull();

    expect(commands.find((entry) => entry.id === "record.convert.task")).toMatchObject({
      disabled: false,
    });
  });

  it("does not invent hierarchy commands for a flat grid", () => {
    const commands = buildGridCommands({
      selection: { id: "contact-1" },
      actions: { onOpen: () => {}, onDelete: () => {} },
    });
    expect(
      commands.some(
        (entry) => entry.id.includes("indent") || entry.id.includes("child"),
      ),
    ).toBe(false);
  });
});
