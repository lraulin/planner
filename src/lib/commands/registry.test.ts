import { describe, expect, it } from "vitest";
import {
  COMMAND_GROUP_LABELS,
  COMMAND_GROUPS,
  matchCommands,
  mergeCommands,
  type Command,
} from "./registry";
import { BUILT_MODULES, MODULES } from "@/components/shell/modules";

function command(id: string, label: string, extra: Partial<Command> = {}): Command {
  return { id, label, group: "app", run: () => {}, ...extra };
}

describe("matchCommands", () => {
  const commands = [
    command("go.schedule", "Weekly Schedule", { keywords: "calendar week" }),
    command("go.tasks", "Tasks"),
    command("go.chooser", "Task Chooser"),
    command("grid.reset", "Reset this grid"),
  ];

  it("keeps the given order for an empty query, so grouping survives", () => {
    expect(matchCommands(commands, "  ").map((c) => c.id)).toEqual(
      commands.map((c) => c.id),
    );
  });

  it("matches a subsequence, not just a substring", () => {
    // The whole point of a palette: type four characters and stop.
    expect(matchCommands(commands, "wksch").map((c) => c.id)).toEqual(["go.schedule"]);
  });

  it("ranks a prefix match above a match that starts later", () => {
    // "Tasks" starts with it; "Task Chooser" does too; "Weekly Schedule" does not match.
    const ids = matchCommands(commands, "task").map((c) => c.id);
    expect(ids.slice(0, 2)).toEqual(["go.tasks", "go.chooser"]);
  });

  it("prefers the tighter match when both start at the same place", () => {
    const spread = [
      command("a", "Reschedule"), // r-e-s adjacent
      command("b", "Result Areas Somewhere"), // r...e...s scattered
    ];
    expect(matchCommands(spread, "res").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("finds a command through its keywords", () => {
    expect(matchCommands(commands, "calendar").map((c) => c.id)).toEqual([
      "go.schedule",
    ]);
  });

  it("matches a keyword by word prefix, not as a subsequence of the whole string", () => {
    // "sched" is a subsequence of "options preferences import export…" and used to drag
    // Settings into the results for a query that has nothing to do with it. A long keyword
    // list must not turn into a haystack that matches everything.
    const settings = command("app.settings", "Settings", {
      keywords: "options preferences import export achieve google calendar reset",
    });
    expect(matchCommands([settings], "sched")).toEqual([]);
    expect(matchCommands([settings], "cal").map((c) => c.id)).toEqual(["app.settings"]);
  });

  it("does not match a keyword from the middle of a word", () => {
    const entry = command("x", "Something", { keywords: "rednotebook" });
    expect(matchCommands([entry], "note")).toEqual([]);
    expect(matchCommands([entry], "red").map((c) => c.id)).toEqual(["x"]);
  });

  it("never lets a keyword match outrank a label match", () => {
    const both = [
      command("keyword-only", "Weekly Schedule", { keywords: "calendar" }),
      command("label", "Calendar Export"),
    ];
    expect(matchCommands(both, "calendar").map((c) => c.id)).toEqual([
      "label",
      "keyword-only",
    ]);
  });

  it("returns nothing rather than guessing on a typo", () => {
    // No edit distance: a palette that offers a wrong-but-close command is worse than one
    // that offers none, because you will press Enter on it.
    expect(matchCommands(commands, "tsak")).toEqual([]);
  });

  it("keeps disabled commands in the results", () => {
    // A command that vanishes when unavailable teaches you it does not exist. It shows
    // greyed, with `title` saying why.
    const withDisabled = [command("rename", "Rename", { disabled: true })];
    expect(matchCommands(withDisabled, "rena").map((c) => c.id)).toEqual(["rename"]);
  });

  it("is case-insensitive on both sides", () => {
    expect(matchCommands(commands, "WEEKLY").map((c) => c.id)).toEqual(["go.schedule"]);
  });
});

describe("mergeCommands", () => {
  it("lets a later list replace an earlier command of the same id", () => {
    // A view registering `grid.reset` must replace the global entry, not sit beside a
    // second row saying the same words.
    const global = [command("grid.reset", "Reset this grid", { disabled: true })];
    const contextual = [command("grid.reset", "Reset this grid")];

    const merged = mergeCommands(global, contextual);
    expect(merged).toHaveLength(1);
    expect(merged[0].disabled).toBeUndefined();
  });

  it("orders by group, and keeps declaration order inside one", () => {
    const merged = mergeCommands([
      command("app.settings", "Settings", { group: "app" }),
      command("view.fields", "Show Fields", { group: "view" }),
      command("go.tasks", "Tasks", { group: "go" }),
      command("view.reset", "Reset this grid", { group: "view" }),
    ]);

    expect(merged.map((c) => c.id)).toEqual([
      "go.tasks",
      "view.fields",
      "view.reset",
      "app.settings",
    ]);
  });

  it("survives being handed nothing", () => {
    expect(mergeCommands()).toEqual([]);
    expect(mergeCommands([], [])).toEqual([]);
  });
});

describe("the palette stays complete", () => {
  it("still lists a command whose control lives on the view bar", () => {
    // `menus.ts` decides what each *menu* surface hides (`overflowMenus`). The palette hides
    // nothing: it answers "what can this app do", and an answer that omits things is one you
    // stop trusting, and then you stop opening it.
    const commands = [command("filter", "Filter…", { ownControl: true })];
    expect(matchCommands(commands, "filter")).toHaveLength(1);
  });
});

describe("command groups", () => {
  it("labels every group", () => {
    for (const group of COMMAND_GROUPS) {
      expect(COMMAND_GROUP_LABELS[group]).toBeTruthy();
    }
  });
});

/**
 * The palette's go-to entries are generated from the module registry, so these are really
 * tests of `modules.ts` — but this is the consumer that a mistake there would break.
 */
describe("modules as command sources", () => {
  it("excludes reserved modules, which have no route to navigate to", () => {
    expect(BUILT_MODULES.some((entry) => entry.status !== "built")).toBe(false);
    expect(MODULES.some((entry) => entry.status === "reserved")).toBe(true);
  });

  it("gives every built module an icon, because the collapsed rail is icons only", () => {
    for (const entry of BUILT_MODULES) {
      expect(entry.icon, `${entry.id} has no icon`).toBeTruthy();
    }
  });

  it("has no duplicate module ids or hrefs", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    expect(new Set(MODULES.map((m) => m.href)).size).toBe(MODULES.length);
  });

  it("marks exactly the three modules the phone bottom bar has slots for", () => {
    expect(MODULES.filter((entry) => entry.primary).map((m) => m.id)).toEqual([
      "tasks",
      "chooser",
      "notes",
    ]);
  });
});
