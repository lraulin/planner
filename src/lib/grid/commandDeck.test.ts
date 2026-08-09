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
    //
    // `New` is the one section here that does not need a row. It is what makes the blank-area
    // menu — the same menu with no selection — worth opening rather than a list of greyed verbs.
    expect(rowMenuSections(commands).map((section) => section.label)).toEqual([
      "Item",
      "Convert to",
      "New",
      "Insert row",
      "Move",
      "Expand",
      "Priority",
      "Zoom",
      "Danger",
    ]);
  });

  it("leaves the blank-area menu something it can actually do", () => {
    // Right-clicking below the last row builds this same menu with no selection. Every item verb
    // is correctly greyed there, so without a creation row it would be a menu of dead entries.
    const sections = rowMenuSections(
      buildGridCommands({
        createKinds: ["task"],
        hierarchy: true,
        selection: { id: null },
        actions: { onCreate: () => {}, onOpen: () => {}, onDelete: () => {} },
      }),
    );

    const live = sections.flatMap((section) =>
      section.commands.filter((command) => command.disabled !== true),
    );
    expect(live.map((command) => command.id)).toEqual(["grid.create"]);
  });

  describe("the cross-module verbs", () => {
    const build = (selection: Parameters<typeof buildGridCommands>[0]["selection"]) =>
      buildGridCommands({
        selection,
        actions: {
          onSetState: () => {},
          onScheduleBlock: () => {},
          onViewTasks: () => {},
          onViewProject: () => {},
        },
      });

    const find = (
      commands: ReturnType<typeof buildGridCommands>,
      id: string,
    ): (typeof commands)[number] => {
      const found = commands.find((entry) => entry.id === id);
      if (!found) throw new Error(`${id} is not in the deck`);
      return found;
    };

    it("greys Complete on a row that already is, and says so", () => {
      // Not hidden: a command that vanishes on exactly the rows where you look for it teaches
      // you it does not exist.
      expect(
        find(build({ id: "n", state: "completed" }), "record.complete"),
      ).toMatchObject({ disabled: true, title: "Already completed" });
      expect(
        find(build({ id: "n", state: "in_progress" }), "record.complete"),
      ).toMatchObject({ disabled: false });
    });

    it("keeps lifecycle commands visible but disabled for Result Areas", () => {
      const reason = "Result Areas do not have a state";
      const commands = build({ id: "ra", state: null, stateReason: reason });
      expect(find(commands, "record.complete")).toMatchObject({
        disabled: true,
        title: reason,
      });
      expect(find(commands, "record.state.in_progress")).toMatchObject({
        disabled: true,
        title: reason,
      });
    });

    it("refuses the whole lifecycle action for a mixed selection", () => {
      const reason = "Result Areas do not have a state; remove them from the selection";
      const commands = build({
        id: "task",
        ids: ["task", "ra"],
        count: 2,
        state: "not_started",
        stateReason: reason,
      });
      expect(find(commands, "record.complete")).toMatchObject({
        label: "Complete (2)",
        disabled: true,
        title: reason,
      });
    });

    it("offers the whole state vocabulary, minus the one the row is already on", () => {
      const commands = build({ id: "n", state: "waiting" });
      const states = commands.filter((entry) => entry.id.startsWith("record.state."));

      expect(states).toHaveLength(9);
      expect(states.every((entry) => entry.section === "State")).toBe(true);
      expect(find(commands, "record.state.waiting").disabled).toBe(true);
      expect(find(commands, "record.state.completed").disabled).toBe(false);
    });

    it("folds the state vocabulary behind one row menu entry", () => {
      // Nine inline rows would be more than half the menu. This is the reason submenus exist.
      const sections = rowMenuSections(build({ id: "n", state: "waiting" }));
      const state = sections.find((section) => section.label === "State");

      expect(state?.submenu).toBe(true);
      expect(state?.commands).toHaveLength(9);
    });

    it("explains a cross-navigation that has nowhere to go", () => {
      const orphan = build({ id: "n", projectId: null, hasTasks: false });
      expect(find(orphan, "record.view-project")).toMatchObject({
        disabled: true,
        title: "This row is not under a project",
      });
      expect(find(orphan, "record.view-tasks")).toMatchObject({
        disabled: true,
        title: "Nothing is filed under this row",
      });

      const filed = build({ id: "n", projectId: "p", hasTasks: true });
      expect(find(filed, "record.view-project").disabled).toBe(false);
      expect(find(filed, "record.view-tasks").disabled).toBe(false);
    });

    it("keeps Achieve's shortcuts on the verbs that had them", () => {
      const commands = build({ id: "n", projectId: "p", hasTasks: true });
      expect(formatBindings(find(commands, "record.complete").bindings)).toBe("⌃L");
      expect(formatBindings(find(commands, "record.schedule-block").bindings)).toBe(
        "⌃⌥⇧B",
      );
      expect(formatBindings(find(commands, "record.view-tasks").bindings)).toBe("⌃T");
      expect(formatBindings(find(commands, "record.view-project").bindings)).toBe(
        "⌃⇧J",
      );
    });

    it("invents none of them for a grid that cannot do them", () => {
      // A catalog of contacts has no state, no project and nothing to schedule.
      const commands = buildGridCommands({
        selection: { id: "c" },
        actions: { onOpen: () => {} },
      });
      for (const id of [
        "record.complete",
        "record.state.completed",
        "record.schedule-block",
        "record.view-tasks",
        "record.view-project",
      ]) {
        expect(
          commands.some((entry) => entry.id === id),
          id,
        ).toBe(false);
      }
    });
  });

  describe("multi-row commands", () => {
    const build = (
      selection: Parameters<typeof buildGridCommands>[0]["selection"],
      actions: Parameters<typeof buildGridCommands>[0]["actions"] = {},
    ) =>
      buildGridCommands({
        selection,
        actions: { onDelete: () => {}, onSetState: () => {}, ...actions },
      });

    it("says how many rows the plural verbs will act on", () => {
      const commands = build({ id: "a", count: 3, ids: ["a", "b", "c"] });
      const labels = new Map(commands.map((entry) => [entry.id, entry.label]));

      expect(labels.get("record.delete")).toBe("Delete (3)");
      expect(labels.get("record.complete")).toBe("Complete (3)");
      expect(labels.get("record.state.waiting")).toBe("Waiting (3)");
    });

    it("stays singular on one row", () => {
      const labels = new Map(
        build({ id: "a", count: 1, ids: ["a"] }).map((e) => [e.id, e.label]),
      );
      expect(labels.get("record.delete")).toBe("Delete");
      expect(labels.get("record.complete")).toBe("Complete");
    });

    it("hands the whole selection to the action, not just the focus row", () => {
      // The bug this exists to prevent: `Delete (3)` removing one row. The label promised
      // three and the old signature could only carry the focus id.
      let deleted: readonly string[] = [];
      const commands = build(
        { id: "a", count: 3, ids: ["a", "b", "c"] },
        {
          onDelete: (ids) => {
            deleted = ids;
          },
        },
      );

      commands.find((entry) => entry.id === "record.delete")?.run();
      expect(deleted).toEqual(["a", "b", "c"]);
    });

    it("falls back to the focus row when the host states no id list", () => {
      // Catalogs are single-selection and never set `ids`.
      let deleted: readonly string[] = [];
      const commands = build(
        { id: "only" },
        {
          onDelete: (ids) => {
            deleted = ids;
          },
        },
      );

      commands.find((entry) => entry.id === "record.delete")?.run();
      expect(deleted).toEqual(["only"]);
    });

    it("leaves the single-row verbs singular however many rows are selected", () => {
      // Opening three drawers is not a thing, and neither is renaming three rows at once.
      const labels = new Map(
        build(
          { id: "a", count: 3, ids: ["a", "b", "c"] },
          {
            onOpen: () => {},
            onRename: () => {},
          },
        ).map((e) => [e.id, e.label]),
      );

      expect(labels.get("record.open")).toBe("Open");
      expect(labels.get("record.rename")).toBe("Rename");
    });
  });

  describe("the row clipboard", () => {
    const build = (clipboard?: {
      pickedUp: number;
      pasteAfterRefusal: string | null;
      pasteChildRefusal: string | null;
    }) =>
      buildGridCommands({
        clipboard,
        selection: { id: "target" },
        actions: { onCutRows: () => {}, onPasteRows: () => {} },
      });

    const at = (commands: ReturnType<typeof buildGridCommands>, id: string) =>
      commands.find((entry) => entry.id === id);

    it("enables a paste the host said is legal", () => {
      // `null` means allowed. Coalescing it to a default greyed out exactly the pastes that
      // were possible, which is what shipped until the browser showed "Paste row" next to
      // "Nothing has been picked up".
      const commands = build({
        pickedUp: 1,
        pasteAfterRefusal: null,
        pasteChildRefusal: null,
      });

      expect(at(commands, "record.paste-rows")).toMatchObject({
        label: "Paste row",
        disabled: false,
      });
      expect(at(commands, "record.paste-child")?.disabled).toBe(false);
    });

    it("carries the host's reason onto the disabled row", () => {
      const commands = build({
        pickedUp: 2,
        pasteAfterRefusal: null,
        pasteChildRefusal: "Cannot paste a row inside itself",
      });

      expect(at(commands, "record.paste-rows")).toMatchObject({
        label: "Paste 2 rows",
        disabled: false,
      });
      expect(at(commands, "record.paste-child")).toMatchObject({
        disabled: true,
        title: "Cannot paste a row inside itself",
      });
    });

    it("greys both when the host states no clipboard at all", () => {
      expect(at(build(), "record.paste-rows")).toMatchObject({
        label: "Paste",
        disabled: true,
        title: "Nothing has been picked up",
      });
    });

    it("cuts the whole selection and says how many", () => {
      let cut: readonly string[] = [];
      const commands = buildGridCommands({
        selection: { id: "a", count: 3, ids: ["a", "b", "c"] },
        actions: {
          onCutRows: (ids) => {
            cut = ids;
          },
        },
      });

      const command = at(commands, "record.cut-rows");
      expect(command?.label).toBe("Cut (3)");
      command?.run();
      expect(cut).toEqual(["a", "b", "c"]);
    });
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

  describe("creating from a module rather than the outline", () => {
    /** What Projects/Tasks/Result Areas declare: one kind, sub-items, no outline surgery. */
    const build = (
      over: Partial<Parameters<typeof buildGridCommands>[0]> = {},
    ): ReturnType<typeof buildGridCommands> =>
      buildGridCommands({
        createKinds: ["project"],
        createChild: true,
        selection: { id: "p1", kind: "project" },
        actions: { onCreate: () => {}, onOpen: () => {} },
        ...over,
      });

    it("names the kind on the button when the module only makes one", () => {
      const commands = build();
      expect(commands.find((entry) => entry.id === "grid.create")?.label).toBe(
        "New project",
      );
      // …and does not then repeat itself: `New` above `New project` was one command twice.
      expect(commands.some((entry) => entry.id === "grid.create.project")).toBe(false);
    });

    it("keeps the bare New where the kinds are a real choice", () => {
      const commands = build({ createKinds: ["goal", "dream"] });
      expect(commands.find((entry) => entry.id === "grid.create")?.label).toBe("New");
      expect(
        commands
          .filter((entry) => entry.id.startsWith("grid.create."))
          .map((entry) => entry.label),
      ).toEqual(["New goal", "New dream", "New sub-goal"]);
    });

    it("files a sub-item under the row it was asked about, not beside it", () => {
      let created: [string, string] | null = null;
      const commands = build({
        actions: { onCreate: (kind, mode) => (created = [kind, mode]) },
      });

      commands.find((entry) => entry.id === "grid.create.subitem")?.run();
      expect(created).toEqual(["project", "child"]);

      // And the top-level verb stays top-level — the whole point of diverging from Achieve,
      // where `New` lands relative to the cursor.
      commands.find((entry) => entry.id === "grid.create")?.run();
      expect(created).toEqual(["project", "top"]);
    });

    it("continues the selected row's kind when this module makes it", () => {
      // Projects with Goals shown: `New subproject` on a goal files a project under it.
      expect(
        build({ selection: { id: "g1", kind: "goal" } }).find(
          (entry) => entry.id === "grid.create.subitem",
        )?.label,
      ).toBe("New subproject");
      // Goals: a dream's sub-item is a dream, because the module makes those too.
      expect(
        build({
          createKinds: ["goal", "dream"],
          selection: { id: "d1", kind: "dream" },
        }).find((entry) => entry.id === "grid.create.subitem")?.label,
      ).toBe("New sub-dream");
    });

    it("leaves the outline's insert set to the outline", () => {
      // The divergence from Achieve, which puts insert-before/after/child in every tab and
      // resolves them against the outline's cursor — so `insert at top level` in the task
      // chooser made a sibling of the first task.
      const ids = build().map((entry) => entry.id);
      expect(ids).not.toContain("grid.create.before");
      expect(ids).not.toContain("grid.create.after");
      expect(ids).not.toContain("grid.create.child");
      expect(ids).not.toContain("record.indent");
    });

    it("greys the sub-item verb with nothing selected, and still offers New", () => {
      const commands = build({ selection: { id: null } });
      expect(
        commands.find((entry) => entry.id === "grid.create.subitem"),
      ).toMatchObject({
        disabled: true,
        title: "Select a row first",
      });
      expect(
        commands.find((entry) => entry.id === "grid.create")?.disabled,
      ).toBeFalsy();
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
