import { describe, expect, it } from "vitest";
import {
  buildGridCommands,
  moreGridCommands,
  primaryGridCommands,
} from "./commandDeck";

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

  it("splits primary deck controls from the complete More list", () => {
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
        onExpandAll: () => {},
        onCollapseAll: () => {},
      },
    });

    expect(primaryGridCommands(commands).map((entry) => entry.id)).toEqual([
      "grid.create",
      "record.open",
      "record.rename",
      "record.move-up",
      "record.move-down",
      "view.expand-all-items",
    ]);
    expect(moreGridCommands(commands).map((entry) => entry.id)).toContain(
      "record.copy-as-text",
    );
    expect(moreGridCommands(commands).map((entry) => entry.id)).not.toContain(
      "grid.create",
    );
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
    expect(toggle).toMatchObject({ label: "Collapse selected", shortcut: "←" });
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
    expect(toggle).toMatchObject({ label: "Expand selected", shortcut: "→" });
    toggle?.run();
    expect(calls).toEqual(["expand"]);
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
