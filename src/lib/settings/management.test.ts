import { describe, expect, it } from "vitest";
import type { SettingsSnapshot } from "./queries";
import { buildPreferenceGroups, bulkResetScopes } from "./management";

const snapshot: SettingsSnapshot = {
  display: { v: 3, dateFormat: "MMMM D, YYYY" },
  shell: { v: 3, sidebarCollapsed: true },
  "grid:tasks": { v: 3 },
  "grid:tasks.active-status": { v: 3 },
  "grid:tasks.saved-deadline": { v: 3 },
  "views:tasks": {
    v: 3,
    views: [{ id: "saved-deadline", name: "Deadline heavy" }],
  },
  "chooser:saved-focus": { v: 3 },
  "grid:chooser.saved-focus": { v: 3 },
  "views:chooser": {
    v: 3,
    views: [{ id: "saved-focus", name: "Deep focus" }],
  },
  "retired:layout": { v: 1 },
};

describe("settings reset management", () => {
  it("groups known scopes without exposing their ids and resolves saved-view names", () => {
    const groups = buildPreferenceGroups(snapshot);
    const tasks = groups.find((group) => group.id === "tasks");
    expect(tasks?.entries.map((entry) => [entry.label, entry.savedView])).toEqual([
      ["Active Status view", false],
      ["Deadline heavy", true],
      ["Default view", false],
    ]);
    expect(tasks?.entries.every((entry) => !entry.showScopeId)).toBe(true);

    const chooser = groups.find((group) => group.id === "chooser");
    expect(chooser?.entries.some((entry) => entry.label === "Deep focus")).toBe(true);
    expect(chooser?.entries.filter((entry) => entry.savedView)).toHaveLength(2);
  });

  it("keeps unknown legacy scopes individually reachable under Other", () => {
    const other = buildPreferenceGroups(snapshot).find((group) => group.id === "other");
    expect(other?.entries).toEqual([
      expect.objectContaining({
        scope: "retired:layout",
        label: "retired:layout",
        showScopeId: true,
      }),
    ]);
  });

  it("excludes catalogues and saved-view-owned scopes from module and global resets", () => {
    const groups = buildPreferenceGroups(snapshot);
    expect(groups.find((group) => group.id === "tasks")?.resetScopes).toEqual([
      "grid:tasks.active-status",
      "grid:tasks",
    ]);
    expect(bulkResetScopes(snapshot)).toEqual([
      "display",
      "grid:tasks",
      "grid:tasks.active-status",
      "retired:layout",
      "shell",
    ]);
  });
});
