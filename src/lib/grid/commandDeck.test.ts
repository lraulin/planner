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
