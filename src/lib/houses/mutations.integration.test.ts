import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import * as geo from "./geo";
import {
  createHouse,
  createHouseOnce,
  deleteHouse,
  refreshHouseRoute,
  updateHouse,
} from "./mutations";
import { getHouseDetail, listHouses } from "./queries";

vi.mock("./geo");

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("houses mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `houses-test-${crypto.randomUUID()}@localhost`,
      name: "Houses Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

const ADDRESS = {
  streetAddress: "123 Main St",
  city: "Annapolis",
  state: "MD",
  postalCode: "21401",
};
const ORIGIN = { lat: 39.0, lon: -76.9 };
const ROUTE = { meters: 40_000, seconds: 2_400 };

function mockRouting() {
  vi.mocked(geo.geocode).mockReset().mockResolvedValue(ORIGIN);
  vi.mocked(geo.driveRoute).mockReset().mockResolvedValue(ROUTE);
}

describeDb("houses mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
    mockRouting();
  });

  it("geocodes and routes a new house that has an address", async () => {
    const id = await createHouse(userId, { nickname: "Blue house", ...ADDRESS });

    const detail = await getHouseDetail(userId, id);
    expect(detail).toMatchObject({
      nickname: "Blue house",
      driveMeters: ROUTE.meters,
      driveSeconds: ROUTE.seconds,
      routeError: null,
    });
    expect(detail?.routedAddress).not.toBeNull();
    expect(geo.geocode).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to route a house with no address", async () => {
    const id = await createHouse(userId, { nickname: "No address yet" });

    const detail = await getHouseDetail(userId, id);
    expect(detail?.routedAddress).toBeNull();
    expect(geo.geocode).not.toHaveBeenCalled();
  });

  it("computes pricePerSqft at read time", async () => {
    const id = await createHouse(userId, {
      askingPriceCents: 300_000_00,
      squareFeet: 1_500,
    });

    const [row] = await listHouses(userId);
    expect(row.id).toBe(id);
    expect(row.pricePerSqft).toBe(200);
  });

  it("re-routes only when the address actually changes", async () => {
    const id = await createHouse(userId, ADDRESS);
    expect(geo.geocode).toHaveBeenCalledTimes(1);

    await updateHouse(userId, id, { notes: "Nice yard" });
    expect(geo.geocode).toHaveBeenCalledTimes(1);

    await updateHouse(userId, id, { city: "Baltimore" });
    expect(geo.geocode).toHaveBeenCalledTimes(2);
  });

  it("saves the house and records routeError when geocoding fails", async () => {
    vi.mocked(geo.geocode).mockResolvedValue(null);

    const id = await createHouse(userId, ADDRESS);

    const detail = await getHouseDetail(userId, id);
    expect(detail?.routeError).toBe("Could not find that address.");
    expect(detail?.driveSeconds).toBeNull();
  });

  it("retries a failed route and clears routeError on success", async () => {
    vi.mocked(geo.geocode).mockResolvedValueOnce(null);
    const id = await createHouse(userId, ADDRESS);
    expect((await getHouseDetail(userId, id))?.routeError).not.toBeNull();

    await refreshHouseRoute(userId, id);

    const detail = await getHouseDetail(userId, id);
    expect(detail?.routeError).toBeNull();
    expect(detail?.driveSeconds).toBe(ROUTE.seconds);
  });

  it("writes only the fields supplied on update", async () => {
    const id = await createHouse(userId, { nickname: "Original", notes: "keep" });
    await updateHouse(userId, id, { nickname: "Renamed" });

    const detail = await getHouseDetail(userId, id);
    expect(detail).toMatchObject({ nickname: "Renamed", notes: "keep" });
  });

  it("keeps priorityRank null unless a letter is set, on create and on update", async () => {
    const id = await createHouse(userId, { priorityRank: 2 });
    expect(await getHouseDetail(userId, id)).toMatchObject({
      priorityLetter: null,
      priorityRank: null,
    });

    await updateHouse(userId, id, { priorityLetter: "A", priorityRank: 1 });
    expect(await getHouseDetail(userId, id)).toMatchObject({
      priorityLetter: "A",
      priorityRank: 1,
    });

    await updateHouse(userId, id, { priorityLetter: null });
    expect(await getHouseDetail(userId, id)).toMatchObject({
      priorityLetter: null,
      priorityRank: null,
    });
  });

  it("resolves a bare letter against the pool instead of writing it verbatim", async () => {
    // The regression this guards: a raw column write of {priorityLetter: "A"} with no
    // rank violates houses_priority_letter_ranked. Houses is a flat pool like the Task
    // Chooser, so a bare letter must resolve to a real position via the shared engine.
    const first = await createHouse(userId, { nickname: "First" });
    const second = await createHouse(userId, { nickname: "Second" });

    await updateHouse(userId, first, { priorityLetter: "A" });
    await updateHouse(userId, second, { priorityLetter: "A" });
    expect(await getHouseDetail(userId, first)).toMatchObject({
      priorityLetter: "A",
      priorityRank: 1,
    });
    expect(await getHouseDetail(userId, second)).toMatchObject({
      priorityLetter: "A",
      priorityRank: 2,
    });

    // Inserting "second" at rank 1 pushes "first" down to 2.
    await updateHouse(userId, second, { priorityLetter: "A", priorityRank: 1 });
    expect(await getHouseDetail(userId, second)).toMatchObject({
      priorityLetter: "A",
      priorityRank: 1,
    });
    expect(await getHouseDetail(userId, first)).toMatchObject({
      priorityLetter: "A",
      priorityRank: 2,
    });
  });

  it("replays a keyed create instead of duplicating", async () => {
    const first = await createHouseOnce(userId, {
      nickname: "Zillow house",
      external: { source: "zillow", id: "z-1" },
    });
    const second = await createHouseOnce(userId, {
      nickname: "Zillow house (retry)",
      external: { source: "zillow", id: "z-1" },
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(await listHouses(userId)).toHaveLength(1);
  });

  it("deletes a house", async () => {
    const id = await createHouse(userId, { nickname: "Gone soon" });
    await deleteHouse(userId, id);
    expect(await getHouseDetail(userId, id)).toBeNull();
  });
});

describeDb("house user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let houseId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    mockRouting();
    houseId = await createHouse(ownerId, { nickname: "Private listing" });
  });

  it("does not let a second user read another user's house", async () => {
    expect(await listHouses(intruderId)).toEqual([]);
    expect(await getHouseDetail(intruderId, houseId)).toBeNull();
  });

  it("does not let a second user change another user's house", async () => {
    await expect(
      updateHouse(intruderId, houseId, { nickname: "Stolen" }),
    ).rejects.toThrow("House not found.");
    expect((await getHouseDetail(ownerId, houseId))?.nickname).toBe("Private listing");
  });

  it("does not let a second user delete another user's house", async () => {
    await expect(deleteHouse(intruderId, houseId)).rejects.toThrow("House not found.");
    expect(await getHouseDetail(ownerId, houseId)).not.toBeNull();
  });

  it("does not let a second user trigger a route refresh on another user's house", async () => {
    await expect(refreshHouseRoute(intruderId, houseId)).rejects.toThrow(
      "House not found.",
    );
    expect(geo.geocode).not.toHaveBeenCalled();
  });
});
