import { describe, expect, it } from "vitest";

import {
  AGENT_BRANCH_PREFIX,
  branchConnectionTarget,
  branchDatabaseUrl,
  organizationProjectResources,
  staleAgentBranchIds,
  weeklySnapshotName,
} from "./neon";

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

describe("agent branches", () => {
  const created = {
    branch: { id: "br-copy-1" },
    endpoints: [
      { type: "read_only", host: "ep-ro.neon.tech" },
      { type: "read_write", host: "ep-rw.neon.tech" },
    ],
    databases: [{ name: "neondb", owner_name: "neondb_owner" }],
    roles: [{ name: "neondb_owner" }, { name: "planner_backup" }],
  };

  it("connects to the read-write host as the one database's owner", () => {
    expect(branchConnectionTarget(created)).toEqual({
      branchId: "br-copy-1",
      host: "ep-rw.neon.tech",
      database: "neondb",
      role: "neondb_owner",
    });
  });

  it("refuses a branch whose database it would have to guess", () => {
    expect(() =>
      branchConnectionTarget({
        ...created,
        databases: [...created.databases, { name: "other", owner_name: "x" }],
      }),
    ).toThrow(/one database/);
  });

  it("encodes a password that would otherwise break the URL", () => {
    const url = branchDatabaseUrl(
      { host: "ep-rw.neon.tech", database: "neondb", role: "neondb_owner" },
      "p@ss/w:rd?#",
    );
    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.password)).toBe("p@ss/w:rd?#");
    expect(parsed.hostname).toBe("ep-rw.neon.tech");
    expect(parsed.pathname).toBe("/neondb");
  });

  it("sweeps only agent branches older than an hour", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    expect(
      staleAgentBranchIds(
        [
          { id: "main", name: "main", created_at: "2026-01-01T00:00:00Z" },
          {
            id: "old",
            name: `${AGENT_BRANCH_PREFIX}a`,
            created_at: "2026-10-23T10:59:00Z",
          },
          {
            id: "live",
            name: `${AGENT_BRANCH_PREFIX}b`,
            created_at: "2026-10-23T11:30:00Z",
          },
          {
            id: "lee",
            name: "preview-agent-dry-run-x",
            created_at: "2026-10-01T00:00:00Z",
          },
        ],
        now,
      ),
    ).toEqual(["old"]);
  });
});
