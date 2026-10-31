import { beforeEach, expect, it } from "vitest";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { createNode } from "./mutations";
import { formatNodePath, loadNodeChain } from "./path";

const describeDb = await describeWithDatabase("tree path");

const makeUser = testUsers("test");

describeDb("loadNodeChain", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
  });

  it("returns root-to-leaf segments for the owner and null for everyone else", async () => {
    const areaId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const projectId = await createNode({
      userId,
      parentId: areaId,
      type: "project",
      name: "Ship",
    });
    const taskId = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "Test",
    });

    const chain = await loadNodeChain(userId, taskId);
    expect(chain).not.toBeNull();
    expect(formatNodePath(chain!)).toBe("Work / Ship / Test");
    expect(chain!.map((s) => s.id)).toEqual([areaId, projectId, taskId]);
    expect(chain![2].parentId).toBe(projectId);

    // Second user: fail to read the chain at every step.
    expect(await loadNodeChain(otherId, taskId)).toBeNull();
    expect(await loadNodeChain(otherId, projectId)).toBeNull();
    expect(await loadNodeChain(otherId, areaId)).toBeNull();
  });

  it("returns null for a missing id", async () => {
    expect(
      await loadNodeChain(userId, "00000000-0000-4000-8000-000000000099"),
    ).toBeNull();
  });
});
