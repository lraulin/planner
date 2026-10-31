import { beforeEach, expect, it } from "vitest";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { createContact } from "@/lib/contacts/mutations";
import { createResource, deleteResource, updateResource } from "./mutations";
import { getResourceDetail, listResources } from "./queries";

const describeDb = await describeWithDatabase("resources mutations");

const makeUser = testUsers("resources-test");

describeDb("resources mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a resource and exposes adjusted weekly capacity", async () => {
    const id = await createResource(userId, {
      shortName: "Lee",
      overheadPercent: 10,
      effectivenessPercent: 80,
      mondayMinutes: 8 * 60,
      tuesdayMinutes: 8 * 60,
      wednesdayMinutes: 8 * 60,
      thursdayMinutes: 8 * 60,
      fridayMinutes: 8 * 60,
    });

    await expect(listResources(userId)).resolves.toEqual([
      expect.objectContaining({
        id,
        shortName: "Lee",
        weeklyWorkingMinutes: 40 * 60,
        weeklyAvailableMinutes: 1728,
      }),
    ]);
  });

  it("keeps a linked contact scoped to its owner", async () => {
    const contactId = await createContact(userId, {
      givenName: "Ada",
      familyName: "King",
    });
    const id = await createResource(userId, { shortName: "Ada", contactId });

    const detail = await getResourceDetail(userId, id);
    expect(detail?.contactId).toBe(contactId);
    expect(detail?.contactName).toBe("Ada King");
  });

  it("writes only the settings supplied on update", async () => {
    const id = await createResource(userId, {
      shortName: "Lee",
      mondayMinutes: 8 * 60,
      overheadPercent: 10,
    });
    await updateResource(userId, id, { tuesdayMinutes: 4 * 60, overheadPercent: 20 });

    const detail = await getResourceDetail(userId, id);
    expect(detail).toMatchObject({
      shortName: "Lee",
      mondayMinutes: 8 * 60,
      tuesdayMinutes: 4 * 60,
      overheadPercent: 20,
    });
  });
});

describeDb("resource user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let resourceId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    resourceId = await createResource(ownerId, { shortName: "Private" });
  });

  it("does not let a second user read another user's resource", async () => {
    expect(await listResources(intruderId)).toEqual([]);
    expect(await getResourceDetail(intruderId, resourceId)).toBeNull();
  });

  it("does not let a second user change another user's resource", async () => {
    await expect(
      updateResource(intruderId, resourceId, { shortName: "Stolen" }),
    ).rejects.toThrow();
    expect((await getResourceDetail(ownerId, resourceId))?.shortName).toBe("Private");
  });

  it("does not let a second user delete another user's resource", async () => {
    await expect(deleteResource(intruderId, resourceId)).rejects.toThrow();
    expect(await getResourceDetail(ownerId, resourceId)).not.toBeNull();
  });

  it("does not let a resource point at another user's contact", async () => {
    const ownerContact = await createContact(ownerId, { givenName: "Private person" });
    await expect(
      createResource(intruderId, { shortName: "Stolen link", contactId: ownerContact }),
    ).rejects.toThrow("Contact not found.");
  });
});
