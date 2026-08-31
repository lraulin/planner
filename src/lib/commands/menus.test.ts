import { describe, expect, it } from "vitest";
import {
  buildMenus,
  commandOrder,
  MENU_SECTIONS,
  NESTED_SECTIONS,
  overflowMenus,
  rowMenuSections,
  sectionShowsHeading,
  toolbarCommands,
  toolbarSegments,
} from "./menus";
import { COMMAND_MENUS, COMMAND_MENU_LABELS, type Command } from "./registry";

function command(id: string, extra: Partial<Command> = {}): Command {
  return { id, label: id, group: "record", run: () => {}, ...extra };
}

describe("buildMenus", () => {
  it("orders menus by the declared bar order, not by when commands arrived", () => {
    // `useCommands` hands over registrations in effect order, which is child-before-parent. A
    // menu bar that reordered itself depending on which grid mounted first is one you have to
    // re-read on every tab.
    const menus = buildMenus([
      command("a", { menu: "view", section: "Layout" }),
      command("b", { menu: "new", section: "New" }),
      command("c", { menu: "organize", section: "Move" }),
    ]);

    expect(menus.map((menu) => menu.id)).toEqual(["new", "organize", "view"]);
    expect(menus.map((menu) => menu.label)).toEqual(["New", "Organize", "View"]);
  });

  it("puts File first even when it arrived last", () => {
    const menus = buildMenus([
      command("new-task", { menu: "new", section: "New" }),
      command("settings", { menu: "file", section: "Account" }),
    ]);
    expect(menus.map((menu) => menu.id)).toEqual(["file", "new"]);
  });

  it("orders sections by the declared taxonomy, not by declaration order", () => {
    // The real case: `Expand all items` is palette-group `view` and `Move up` is `record`, so
    // anything ordering by group or by build order puts Expand above Move inside one menu.
    const [organize] = buildMenus([
      command("expand", { menu: "organize", section: "Expand" }),
      command("zoom", { menu: "organize", section: "Zoom" }),
      command("move", { menu: "organize", section: "Move" }),
      command("priority", { menu: "organize", section: "Priority" }),
    ]);

    expect(organize.sections.map((section) => section.label)).toEqual([
      "Move",
      "Expand",
      "Priority",
      "Zoom",
    ]);
  });

  it("keeps declaration order inside a section", () => {
    const [organize] = buildMenus([
      command("up", { menu: "organize", section: "Move" }),
      command("down", { menu: "organize", section: "Move" }),
      command("indent", { menu: "organize", section: "Move" }),
    ]);

    expect(organize.sections[0].commands.map((entry) => entry.id)).toEqual([
      "up",
      "down",
      "indent",
    ]);
  });

  it("leads with the unlabelled section and trails with sections it has never heard of", () => {
    const [tools] = buildMenus([
      command("invented", { menu: "tools", section: "Import" }),
      command("bare", { menu: "tools" }),
    ]);

    expect(tools.sections.map((section) => section.label)).toEqual([null, "Import"]);
  });

  it("does not render a menu with nothing in it", () => {
    // A flat catalog grid has creation and view control and nothing else. A bar showing five
    // names where three open empty menus teaches you to stop opening them.
    const menus = buildMenus([command("only", { menu: "new", section: "New" })]);
    expect(menus.map((menu) => menu.id)).toEqual(["new"]);
  });

  it("leaves out a command with no menu", () => {
    expect(buildMenus([command("nowhere")])).toEqual([]);
  });

  it("takes the newest definition of an id but keeps its original place", () => {
    const menus = buildMenus([
      command("first", { menu: "new", section: "New" }),
      command("dupe", { menu: "new", section: "New", label: "old" }),
      command("dupe", { menu: "new", section: "New", label: "new" }),
    ]);

    expect(menus[0].sections[0].commands.map((entry) => entry.label)).toEqual([
      "first",
      "new",
    ]);
  });
});

describe("nested sections", () => {
  it("marks a declared family as a submenu wherever it renders", () => {
    // Same flag on the bar and on the row menu: `Organize ▾ → Rank ▸` and a right-click's
    // `Rank ▸` are the same family, so a user who learns one has learned the other.
    const [organize] = buildMenus([
      command("a", { menu: "organize", section: "Convert to" }),
      command("b", { menu: "organize", section: "Convert to" }),
    ]);

    expect(organize.sections[0]).toMatchObject({ label: "Convert to", submenu: true });
  });

  it("leaves the verb families flat", () => {
    // `Item` and `Danger` are what you opened the menu for. Burying Delete one hover deep
    // is hiding it, not organizing it. `Move` used to sit with them; five movement verbs
    // dominate the row the way Convert to's kinds used to, so it nests now.
    const [item] = buildMenus([
      command("open", { menu: "item", section: "Item" }),
      command("rename", { menu: "item", section: "Item" }),
      command("delete", { menu: "item", section: "Danger", destructive: true }),
      command("delete-many", { menu: "item", section: "Danger", destructive: true }),
    ]);

    expect(
      item.sections.map((section) => [section.label, section.submenu === true]),
    ).toEqual([
      ["Item", false],
      ["Danger", false],
    ]);
  });

  it("nests Move on Organize and Go on Item once each family has two members", () => {
    const menus = buildMenus([
      command("up", { menu: "organize", section: "Move" }),
      command("down", { menu: "organize", section: "Move" }),
      command("tasks", { menu: "item", section: "Go" }),
      command("project", { menu: "item", section: "Go" }),
    ]);
    const organize = menus.find((menu) => menu.id === "organize");
    const item = menus.find((menu) => menu.id === "item");

    expect(organize?.sections[0]).toMatchObject({ label: "Move", submenu: true });
    expect(item?.sections[0]).toMatchObject({ label: "Go", submenu: true });
  });

  it("does not nest a section holding a single command", () => {
    // A fly-out onto one row is a hover you have to perform to learn there was nothing behind
    // it — and it happens for real, on a grid with one conversion target, or a host with a
    // single Go or Move verb.
    const menus = buildMenus([
      command("only-convert", { menu: "item", section: "Convert to" }),
      command("only-go", { menu: "item", section: "Go" }),
      command("only-move", { menu: "organize", section: "Move" }),
    ]);

    expect(
      menus.flatMap((menu) =>
        menu.sections.map((section) => [
          section.label,
          section.submenu === true,
          section.commands.length,
        ]),
      ),
    ).toEqual([
      ["Go", false, 1],
      ["Convert to", false, 1],
      ["Move", false, 1],
    ]);
  });

  it("never nests the leading unlabelled section", () => {
    // There would be no row to open it with.
    const [tools] = buildMenus([
      command("bare", { menu: "tools" }),
      command("also-bare", { menu: "tools" }),
    ]);

    expect(tools.sections[0]).toMatchObject({ label: null });
    expect(tools.sections[0].submenu).toBeUndefined();
  });

  it("carries the flag into the row menu without disturbing its ordering", () => {
    const sections = rowMenuSections([
      command("convert-a", { menu: "item", section: "Convert to", rowMenu: true }),
      command("convert-b", { menu: "item", section: "Convert to", rowMenu: true }),
      command("open", { menu: "item", section: "Item", rowMenu: true }),
      command("delete", {
        menu: "item",
        section: "Danger",
        rowMenu: true,
        destructive: true,
      }),
    ]);

    expect(sections.map((s) => [s.label, s.submenu === true] as const)).toEqual([
      ["Item", false],
      ["Convert to", true],
      ["Danger", false],
    ]);
  });

  it("nests every family it names inside a menu that declares it", () => {
    // A section can only nest if some menu actually orders it; one named here and listed in no
    // `MENU_SECTIONS` entry would still render, but after the known sections, which is not
    // where anyone put it on purpose.
    const declared = new Set(Object.values(MENU_SECTIONS).flat());
    for (const label of NESTED_SECTIONS) {
      expect(declared.has(label), `${label} nests but no menu orders it`).toBe(true);
    }
  });
});

describe("commandOrder", () => {
  it("dedupes by id, last winning, without reordering", () => {
    const ordered = commandOrder([
      command("a", { disabled: true }),
      command("b"),
      command("a"),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(ordered[0].disabled).toBeUndefined();
  });
});

describe("toolbarCommands", () => {
  it("sorts by declared weight, not by build order", () => {
    // The row reads create → insert → move → item verbs, which is not the order
    // `buildGridCommands` happens to emit them in.
    const promoted = toolbarCommands([
      command("rename", { toolbar: 50 }),
      command("new", { toolbar: 10 }),
      command("move-up", { toolbar: 30 }),
    ]);

    expect(promoted.map((entry) => entry.id)).toEqual(["new", "move-up", "rename"]);
  });

  it("ignores everything without a weight", () => {
    expect(toolbarCommands([command("menu-only")])).toEqual([]);
  });

  it("treats weight zero as promoted", () => {
    // `toolbar: 0` is a legitimate first position; a truthiness check would silently drop it.
    expect(
      toolbarCommands([command("first", { toolbar: 0 })]).map((e) => e.id),
    ).toEqual(["first"]);
  });
});

describe("toolbarSegments", () => {
  it("groups the row by weight decade, so a hairline lands between clusters", () => {
    const segments = toolbarSegments([
      command("new", { toolbar: 10 }),
      command("before", { toolbar: 20 }),
      command("after", { toolbar: 21 }),
      command("up", { toolbar: 30 }),
      command("down", { toolbar: 31 }),
      command("rename", { toolbar: 50 }),
    ]);

    expect(segments.map((segment) => segment.map((entry) => entry.id))).toEqual([
      ["new"],
      ["before", "after"],
      ["up", "down"],
      ["rename"],
    ]);
  });

  it("is empty rather than one empty segment when nothing is promoted", () => {
    // The command row renders `null` on this; a single empty segment would draw a stray divider.
    expect(toolbarSegments([command("menu-only")])).toEqual([]);
  });
});

describe("sectionShowsHeading", () => {
  it("skips the heading on a one-command un-nested section", () => {
    // Height, not taxonomy: `New` and `Delete` already name themselves. Nested families
    // already occupy one row and never got a heading.
    expect(
      sectionShowsHeading({
        label: "New",
        commands: [command("grid.create", { menu: "new", section: "New" })],
      }),
    ).toBe(false);
    expect(
      sectionShowsHeading({
        label: "Item",
        commands: [
          command("open", { menu: "item", section: "Item" }),
          command("rename", { menu: "item", section: "Item" }),
        ],
      }),
    ).toBe(true);
    expect(
      sectionShowsHeading({
        label: "Move",
        commands: [
          command("up", { menu: "organize", section: "Move" }),
          command("down", { menu: "organize", section: "Move" }),
        ],
        submenu: true,
      }),
    ).toBe(false);
    expect(
      sectionShowsHeading({
        label: null,
        commands: [command("bare", { menu: "tools" })],
      }),
    ).toBe(false);
  });
});

describe("rowMenuSections", () => {
  it("shows only opted-in commands", () => {
    const sections = rowMenuSections([
      command("open", { menu: "item", section: "Item", rowMenu: true }),
      command("fields", { menu: "view", section: "Layout" }),
    ]);

    expect(sections.flatMap((section) => section.commands.map((c) => c.id))).toEqual([
      "open",
    ]);
  });

  it("leads with the item verbs, not with New the way the bar does", () => {
    // You right-clicked a row to do something to that row. The bar leads with New because that
    // is where a session starts; this menu is answering a different question.
    const sections = rowMenuSections([
      command("insert", { menu: "new", section: "Insert row", rowMenu: true }),
      command("move", { menu: "organize", section: "Move", rowMenu: true }),
      command("open", { menu: "item", section: "Item", rowMenu: true }),
    ]);

    expect(sections.map((section) => section.label)).toEqual([
      "Item",
      "Insert row",
      "Move",
    ]);
  });

  it("sinks a destructive section to the bottom", () => {
    // In the bar, Danger is the last thing in the Item menu. Here the menu opens *under the
    // pointer*, so Delete two rows from the top is a misclick waiting to happen.
    const sections = rowMenuSections([
      command("delete", {
        menu: "item",
        section: "Danger",
        rowMenu: true,
        destructive: true,
      }),
      command("open", { menu: "item", section: "Item", rowMenu: true }),
      command("move", { menu: "organize", section: "Move", rowMenu: true }),
    ]);

    expect(sections.map((section) => section.label)).toEqual([
      "Item",
      "Move",
      "Danger",
    ]);
  });

  it("keeps a row-menu command that forgot to name a menu", () => {
    // A stray row at the bottom is a visible bug; a command silently missing from the only
    // surface a touch user has is an invisible one.
    const sections = rowMenuSections([command("orphan", { rowMenu: true })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].commands.map((entry) => entry.id)).toEqual(["orphan"]);
  });

  it("is empty when nothing opted in", () => {
    expect(rowMenuSections([command("a", { menu: "item", section: "Item" })])).toEqual(
      [],
    );
  });
});

describe("overflowMenus", () => {
  it("drops only the commands whose widget is still on screen below md", () => {
    // `⋯` is the phone's menu bar. `Filter…` has a Filter button on the view bar down there, so
    // reprinting it is the clutter the overflow tier exists to remove — but `New` and `Move up`
    // are icon buttons on the *command* row, which the phone does not render at all, so `⋯` is
    // the only place they exist.
    const menus = overflowMenus([
      command("filter", { menu: "view", section: "Layout", ownControl: true }),
      command("fields", { menu: "view", section: "Layout" }),
      command("new", { menu: "new", section: "New", toolbar: 10 }),
    ]);

    expect(
      menus.flatMap((menu) =>
        menu.sections.flatMap((s) => s.commands.map((c) => c.id)),
      ),
    ).toEqual(["new", "fields"]);
  });
});

describe("the taxonomy itself", () => {
  it("labels every menu", () => {
    for (const menu of COMMAND_MENUS) {
      expect(COMMAND_MENU_LABELS[menu], `${menu} has no label`).toBeTruthy();
    }
  });

  it("declares a section list for every menu", () => {
    for (const menu of COMMAND_MENUS) {
      expect(MENU_SECTIONS[menu], `${menu} has no section list`).toBeDefined();
    }
  });

  it("has no duplicate section name inside one menu", () => {
    for (const menu of COMMAND_MENUS) {
      const sections = MENU_SECTIONS[menu];
      expect(new Set(sections).size, `${menu} repeats a section`).toBe(sections.length);
    }
  });
});
