import { describe, expect, it } from "vitest";

import { organizationProjectResources, weeklySnapshotName } from "./neon";

describe("organizationProjectResources", () => {
  it("scopes every personal-key project lookup to its organization", () => {
    expect(
      organizationProjectResources({
        organizations: [{ id: "org-one" }, { id: "org-two" }],
      }),
    ).toEqual([
      "/projects?org_id=org-one&search=planner&limit=100",
      "/projects?org_id=org-two&search=planner&limit=100",
    ]);
  });
});

describe("weeklySnapshotName", () => {
  it("uses the current UTC Sunday", () => {
    expect(weeklySnapshotName(new Date("2026-09-06T23:59:59Z"))).toBe(
      "planner-weekly-2026-09-06",
    );
  });

  it("catches up under the preceding Sunday when the Mac wakes later in the week", () => {
    expect(weeklySnapshotName(new Date("2026-09-09T12:00:00Z"))).toBe(
      "planner-weekly-2026-09-06",
    );
  });
});
