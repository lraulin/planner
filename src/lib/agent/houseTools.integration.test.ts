import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import * as geo from "@/lib/houses/geo";
import { dispatchAgentTool } from "./tools";

vi.mock("@/lib/houses/geo");

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("houses agent tools");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `houses-agent-${crypto.randomUUID()}@localhost`,
      name: "Houses Agent Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) await db.delete(users).where(eq(users.id, id));
});

type HouseDetail = {
  id: string;
  nickname: string;
  streetAddress: string;
  state: string;
  status: string;
  driveSeconds: number | null;
  driveMeters: number | null;
  routeError: string | null;
};
type CreatedHouse = { house: HouseDetail; created: boolean };

describeDb("houses agent tools", () => {
  let userId: string;
  let otherId: string;

  beforeEach(async () => {
    userId = await makeUser();
    otherId = await makeUser();
    vi.mocked(geo.geocode).mockReset().mockResolvedValue({ lat: 39.0, lon: -76.9 });
    vi.mocked(geo.driveRoute)
      .mockReset()
      .mockResolvedValue({ meters: 40_000, seconds: 2_400 });
  });

  it("creates, lists, reads, and updates a house", async () => {
    const created = (await dispatchAgentTool(
      "create_house",
      {
        nickname: "Blue House",
        streetAddress: "123 Main St",
        city: "Annapolis",
        state: "MD",
        postalCode: "21401",
        askingPriceCents: 45_000_000,
        squareFeet: 1_500,
      },
      userId,
    )) as CreatedHouse;
    expect(created.created).toBe(true);
    expect(created.house.nickname).toBe("Blue House");
    expect(created.house.driveSeconds).toBe(2_400);

    const listed = (await dispatchAgentTool(
      "list_houses",
      { query: "Blue" },
      userId,
    )) as {
      houses: { id: string; nickname: string; notes?: string }[];
      pageInfo: { total: number };
    };
    expect(listed.pageInfo.total).toBe(1);
    expect(listed.houses[0]?.id).toBe(created.house.id);
    expect(listed.houses[0]).not.toHaveProperty("notes");

    const updated = (await dispatchAgentTool(
      "update_house",
      { id: created.house.id, status: "offer_made", priorityLetter: "A" },
      userId,
    )) as { house: { status: string; nickname: string; priorityLetter: string } };
    expect(updated.house.status).toBe("offer_made");
    expect(updated.house.priorityLetter).toBe("A");
    expect(updated.house.nickname).toBe("Blue House");
  });

  it("re-routes only when the address changes", async () => {
    const created = (await dispatchAgentTool(
      "create_house",
      {
        streetAddress: "123 Main St",
        city: "Annapolis",
        state: "MD",
        postalCode: "21401",
      },
      userId,
    )) as CreatedHouse;
    expect(geo.geocode).toHaveBeenCalledTimes(1);

    await dispatchAgentTool(
      "update_house",
      { id: created.house.id, notes: "Nice yard" },
      userId,
    );
    expect(geo.geocode).toHaveBeenCalledTimes(1);

    await dispatchAgentTool(
      "update_house",
      { id: created.house.id, city: "Baltimore" },
      userId,
    );
    expect(geo.geocode).toHaveBeenCalledTimes(2);
  });

  it("saves the house and reports routeError when geocoding fails", async () => {
    vi.mocked(geo.geocode).mockResolvedValue(null);
    const created = (await dispatchAgentTool(
      "create_house",
      { streetAddress: "nonsense", city: "nowhere", state: "ZZ", postalCode: "00000" },
      userId,
    )) as CreatedHouse;
    expect(created.house.routeError).toBe("Could not find that address.");
    expect(created.house.driveSeconds).toBeNull();
  });

  it("replays a keyed house create instead of duplicating", async () => {
    const first = (await dispatchAgentTool(
      "create_house",
      { nickname: "Zillow house", externalSource: "zillow", externalId: "z-1" },
      userId,
    )) as CreatedHouse;
    const replay = (await dispatchAgentTool(
      "create_house",
      { nickname: "Different name", externalSource: "zillow", externalId: "z-1" },
      userId,
    )) as CreatedHouse;
    expect(replay.created).toBe(false);
    expect(replay.house.id).toBe(first.house.id);
    expect(replay.house.nickname).toBe("Zillow house");
  });

  it("requires both externalSource and externalId together", async () => {
    await expect(
      dispatchAgentTool(
        "create_house",
        { nickname: "Half key", externalSource: "zillow" },
        userId,
      ),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an update with no fields", async () => {
    const created = (await dispatchAgentTool(
      "create_house",
      { nickname: "Original" },
      userId,
    )) as CreatedHouse;
    await expect(
      dispatchAgentTool("update_house", { id: created.house.id }, userId),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("deletes a house", async () => {
    const created = (await dispatchAgentTool(
      "create_house",
      { nickname: "Gone soon" },
      userId,
    )) as CreatedHouse;
    const deleted = (await dispatchAgentTool(
      "delete_house",
      { id: created.house.id },
      userId,
    )) as { deleted: true; id: string };
    expect(deleted).toEqual({ deleted: true, id: created.house.id });
    await expect(
      dispatchAgentTool("get_house", { id: created.house.id }, userId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not let a second user read, change, or delete the first user's house", async () => {
    const created = (await dispatchAgentTool(
      "create_house",
      { nickname: "Private" },
      userId,
    )) as CreatedHouse;

    const houses = (await dispatchAgentTool("list_houses", {}, otherId)) as {
      houses: unknown[];
    };
    expect(houses.houses).toEqual([]);

    await expect(
      dispatchAgentTool("get_house", { id: created.house.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool(
        "update_house",
        { id: created.house.id, nickname: "Stolen" },
        otherId,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      dispatchAgentTool("delete_house", { id: created.house.id }, otherId),
    ).rejects.toMatchObject({ code: "not_found" });

    const still = (await dispatchAgentTool(
      "get_house",
      { id: created.house.id },
      userId,
    )) as { house: { nickname: string } };
    expect(still.house.nickname).toBe("Private");
  });
});
