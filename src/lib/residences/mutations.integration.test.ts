import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createResidence, deleteResidence, updateResidence } from "./mutations";
import { getResidenceDetail, listResidenceDates, listResidences } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("residences mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `residences-test-${crypto.randomUUID()}@localhost`,
      name: "Residences Test",
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

describeDb("residences mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("stores a Korean address and renders it without empty separators", async () => {
    const id = await createResidence(userId, {
      streetAddress: "12 Sejong-daero",
      city: "Seoul",
      region: "",
      postalCode: "04524",
      country: "South Korea",
      movedIn: "2014-08-01",
      movedOut: "2017-02-15",
    });

    const [row] = await listResidences(userId);
    expect(row.id).toBe(id);
    expect(row.address).toBe("12 Sejong-daero, Seoul, 04524, South Korea");
  });

  it("sorts undated residences last rather than first", async () => {
    await createResidence(userId, { city: "Undated" });
    await createResidence(userId, { city: "Seoul", movedIn: "2014-08-01" });
    await createResidence(userId, { city: "Boston", movedIn: "2020-01-01" });
    const cities = (await listResidences(userId)).map((row) => row.city);
    expect(cities).toEqual(["Boston", "Seoul", "Undated"]);
  });

  it("writes only the fields supplied on update", async () => {
    const id = await createResidence(userId, {
      city: "Boston",
      landlordName: "Ada King",
      monthlyRent: "1850.00",
    });
    await updateResidence(userId, id, { city: "Cambridge" });

    await expect(getResidenceDetail(userId, id)).resolves.toMatchObject({
      city: "Cambridge",
      landlordName: "Ada King",
      monthlyRent: "1850.00",
    });
  });

  it("rejects moving out before moving in, in our words", async () => {
    await expect(
      createResidence(userId, { movedIn: "2020-06-01", movedOut: "2020-01-01" }),
    ).rejects.toThrow("Moved out cannot be before moved in.");
  });

  it("clears a date rather than storing a blank string", async () => {
    const id = await createResidence(userId, {
      city: "Boston",
      movedOut: "2021-01-01",
    });
    await updateResidence(userId, id, { movedOut: "" });
    await expect(getResidenceDetail(userId, id)).resolves.toMatchObject({
      movedOut: null,
    });
  });

  it("exposes only dated residences' edges to the chronology", async () => {
    await createResidence(userId, { city: "Seoul", movedIn: "2014-08-01" });
    await createResidence(userId, { city: "Undated" });
    const dates = await listResidenceDates(userId);
    expect(dates).toHaveLength(2);
    expect(dates.filter((row) => row.movedIn !== null)).toHaveLength(1);
  });
});

describeDb("residence user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let residenceId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    residenceId = await createResidence(ownerId, { city: "Private" });
  });

  it("does not let a second user read another user's residence", async () => {
    expect(await listResidences(intruderId)).toEqual([]);
    expect(await listResidenceDates(intruderId)).toEqual([]);
    expect(await getResidenceDetail(intruderId, residenceId)).toBeNull();
  });

  it("does not let a second user change another user's residence", async () => {
    await expect(
      updateResidence(intruderId, residenceId, { city: "Stolen" }),
    ).rejects.toThrow();
    expect((await getResidenceDetail(ownerId, residenceId))?.city).toBe("Private");
  });

  it("does not let a second user delete another user's residence", async () => {
    await expect(deleteResidence(intruderId, residenceId)).rejects.toThrow();
    expect(await getResidenceDetail(ownerId, residenceId)).not.toBeNull();
  });
});
