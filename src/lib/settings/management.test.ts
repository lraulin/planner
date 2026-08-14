import { describe, expect, it } from "vitest";
import type { SettingsSnapshot } from "./queries";
import {
  buildPreferenceGroups,
  bulkResetScopes,
  restoreDefaultViewScopeWrites,
} from "./management";

const snapshot: SettingsSnapshot = {
  display: { v: 3, dateFormat: "MMMM D, YYYY" },
  shell: { v: 3, sidebarCollapsed: true },
  "grid:tasks": { v: 3 },
  "grid:tasks.active-status": { v: 3 },
  "grid:tasks.saved-deadline": { v: 3 },
  "views:tasks": {
    v: 3,
    views: [
      {
        id: "active-status",
        name: "Active Status",
        base: "active-status",
        order: null,
        widths: {},
        filters: {},
        advancedFilter: null,
        search: "",
        sorts: [],
        groupBy: [],
        collapsedGroups: [],
        density: "comfortable",
        switches: {},
        defaultSeed: {
          id: "active-status",
          name: "Active Status",
          base: "active-status",
          settings: {
            order: null,
            widths: {},
            filters: {},
            advancedFilter: null,
            search: "",
            sorts: [],
            groupBy: [],
            collapsedGroups: [],
            density: "comfortable",
            switches: {},
          },
        },
      },
      { id: "saved-deadline", name: "Deadline heavy" },
    ],
    deletedDefaults: [],
  },
  "chooser:saved-focus": { v: 3 },
  "grid:chooser.saved-focus": { v: 3 },
  "views:chooser": {
    v: 3,
    views: [{ id: "saved-focus", name: "Deep focus" }],
    deletedDefaults: [],
  },
  "retired:layout": { v: 1 },
};

describe("settings reset management", () => {
  it("groups known scopes without exposing their ids and resolves saved-view names", () => {
    const groups = buildPreferenceGroups(snapshot);
    const tasks = groups.find((group) => group.id === "tasks");
    expect(tasks?.entries.map((entry) => [entry.label, entry.viewEntry])).toEqual([
      ["Active Status", true],
      ["Deadline heavy", true],
      ["Default view", false],
    ]);
    expect(tasks?.entries.every((entry) => !entry.showScopeId)).toBe(true);

    const chooser = groups.find((group) => group.id === "chooser");
    expect(chooser?.entries.some((entry) => entry.label === "Deep focus")).toBe(true);
    expect(chooser?.entries.filter((entry) => entry.viewEntry)).toHaveLength(2);
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
      "grid:tasks",
    ]);
    expect(bulkResetScopes(snapshot)).toEqual([
      "display",
      "grid:tasks",
      "retired:layout",
      "shell",
    ]);
  });

  it("writes restored default catalogues at module and global scope", () => {
    const changed: SettingsSnapshot = {
      ...snapshot,
      "views:tasks": {
        v: 3,
        views: [
          {
            id: "active-status",
            name: "Renamed",
            base: "active-status",
            order: ["name"],
            widths: {},
            filters: {},
            advancedFilter: null,
            search: "",
            sorts: [],
            groupBy: [],
            collapsedGroups: [],
            density: "compact",
            switches: {},
            defaultSeed: {
              id: "active-status",
              name: "Active Status",
              base: "active-status",
              settings: {
                order: null,
                widths: {},
                filters: {},
                advancedFilter: null,
                search: "",
                sorts: [],
                groupBy: [],
                collapsedGroups: [],
                density: "comfortable",
                switches: {},
              },
            },
          },
        ],
        deletedDefaults: [],
      },
    };
    const writes = restoreDefaultViewScopeWrites(changed);
    expect(writes.map((entry) => entry.scope)).toEqual(["views:tasks"]);
    expect(
      restoreDefaultViewScopeWrites(changed, "tasks").map((entry) => entry.scope),
    ).toEqual(["views:tasks"]);
    expect(restoreDefaultViewScopeWrites(changed, "chooser")).toEqual([]);
  });
});
