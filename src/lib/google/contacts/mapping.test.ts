import { describe, expect, it } from "vitest";
import { mapGooglePerson, type GooglePerson } from "./mapping";

describe("mapGooglePerson", () => {
  it("maps People fields into the existing contact shape", () => {
    const person: GooglePerson = {
      resourceName: "people/c123",
      etag: "etag-1",
      metadata: {
        previousResourceNames: ["people/old"],
        sources: [
          { type: "PROFILE", updateTime: "2026-08-06T10:00:00Z" },
          { type: "CONTACT", updateTime: "2026-08-07T10:00:00Z" },
        ],
      },
      names: [
        {
          metadata: { primary: true },
          honorificPrefix: "Dr.",
          givenName: "Ada",
          middleName: "Lovelace",
          familyName: "King",
          honorificSuffix: "III",
        },
      ],
      nicknames: [
        { type: "DEFAULT", value: "Enchantress" },
        { type: "INITIALS", value: "ALK" },
      ],
      organizations: [
        { name: "Old Co", title: "Former", department: "Past" },
        { current: true, name: "Analytical", title: "Founder", department: "R&D" },
      ],
      relations: [
        { type: "manager", person: "Charles" },
        { type: "assistant", person: "Mary" },
      ],
      memberships: [
        {
          contactGroupMembership: {
            contactGroupResourceName: "contactGroups/friends",
          },
        },
      ],
      birthdays: [{ date: { year: 1815, month: 12, day: 10 } }],
      photos: [
        { metadata: { primary: true }, default: true, url: "default" },
        { default: false, url: "https://example.com/ada.jpg" },
      ],
      biographies: [{ value: "First programmer", contentType: "TEXT_PLAIN" }],
      phoneNumbers: [
        { metadata: { primary: true }, type: "mobile", value: "+1 (555) 0100" },
      ],
      emailAddresses: [
        {
          metadata: { primary: true },
          type: "work",
          value: "ada@example.com",
          displayName: "Ada at work",
        },
      ],
      addresses: [
        {
          metadata: { primary: true },
          type: "home",
          formattedValue: "12 St James's Square, London",
          streetAddress: "12 St James's Square",
          city: "London",
          country: "United Kingdom",
          countryCode: "GB",
        },
      ],
      urls: [{ type: "profile", value: "https://example.com/ada" }],
      events: [{ type: "anniversary", date: { month: 7, day: 5 } }],
      imClients: [{ protocol: "Signal", username: "ada.1" }],
      userDefined: [{ key: "Customer ID", value: "42" }],
    };

    const mapped = mapGooglePerson(
      person,
      new Map([["contactGroups/friends", "Friends"]]),
    );

    expect(mapped).toMatchObject({
      externalId: "people/c123",
      previousExternalIds: ["people/old"],
      externalEtag: "etag-1",
      externalUpdatedAt: new Date("2026-08-07T10:00:00Z"),
      deleted: false,
      fields: {
        namePrefix: "Dr.",
        givenName: "Ada",
        middleName: "Lovelace",
        familyName: "King",
        nameSuffix: "III",
        nickname: "Enchantress",
        initials: "ALK",
        company: "Analytical",
        jobTitle: "Founder",
        department: "R&D",
        managerName: "Charles",
        assistantName: "Mary",
        groupName: "Friends",
        birthdayYear: 1815,
        birthdayMonth: 12,
        birthdayDay: 10,
        photoUrl: "https://example.com/ada.jpg",
        notes: "First programmer",
      },
    });
    expect(mapped?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "phone",
          label: "mobile",
          value: "+1 (555) 0100",
          isPrimary: true,
        }),
        expect.objectContaining({
          kind: "email",
          value: "ada@example.com",
          displayName: "Ada at work",
        }),
        expect.objectContaining({
          kind: "address",
          value: "12 St James's Square, London",
          city: "London",
          countryCode: "GB",
        }),
        expect.objectContaining({ kind: "url", value: "https://example.com/ada" }),
        expect.objectContaining({
          kind: "relation",
          label: "manager",
          value: "Charles",
        }),
        expect.objectContaining({
          kind: "event",
          label: "anniversary",
          value: "--07-05",
        }),
        expect.objectContaining({ kind: "im", label: "Signal", value: "ada.1" }),
        expect.objectContaining({
          kind: "user_defined",
          label: "Customer ID",
          value: "42",
        }),
      ]),
    );
  });

  it("keeps malformed partial birthdays out of the database shape", () => {
    const mapped = mapGooglePerson({
      resourceName: "people/c1",
      birthdays: [{ date: { year: 2000, month: 2 } }],
    });

    expect(mapped?.fields).toMatchObject({
      birthdayYear: 2000,
      birthdayMonth: null,
      birthdayDay: null,
    });
  });

  it("does not import HTML biographies as plain contact notes", () => {
    const mapped = mapGooglePerson({
      resourceName: "people/c1",
      biographies: [{ value: "<b>not markdown</b>", contentType: "TEXT_HTML" }],
    });
    expect(mapped?.fields.notes).toBe("");
  });

  it("maps deleted resources without requiring fields", () => {
    expect(
      mapGooglePerson({
        resourceName: "people/c1",
        metadata: { deleted: true, previousResourceNames: ["people/old"] },
      }),
    ).toMatchObject({
      externalId: "people/c1",
      previousExternalIds: ["people/old"],
      deleted: true,
      items: [],
    });
  });

  it("drops a response without a resource name instead of inventing identity", () => {
    expect(mapGooglePerson({ names: [{ givenName: "Ada" }] })).toBeNull();
  });
});
