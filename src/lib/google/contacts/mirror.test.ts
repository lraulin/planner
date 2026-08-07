import { describe, expect, it } from "vitest";
import type { RemoteContactItem, RemoteGoogleContact } from "./mapping";
import {
  contactItemKey,
  planContactItems,
  planContactMirror,
  type LocalGoogleContact,
} from "./mirror";

function remote(
  externalId: string,
  externalEtag = "etag-1",
  patch: Partial<RemoteGoogleContact> = {},
): RemoteGoogleContact {
  return {
    externalId,
    previousExternalIds: [],
    externalEtag,
    externalUpdatedAt: null,
    deleted: false,
    fields: {
      namePrefix: "",
      givenName: "Ada",
      middleName: "",
      familyName: "Lovelace",
      nameSuffix: "",
      nickname: "",
      initials: "",
      company: "",
      jobTitle: "",
      department: "",
      managerName: "",
      assistantName: "",
      groupName: "",
      birthdayYear: null,
      birthdayMonth: null,
      birthdayDay: null,
      photoUrl: "",
      notes: "",
    },
    items: [],
    ...patch,
  };
}

const local: LocalGoogleContact[] = [
  { id: "local-1", externalId: "people/c1", externalEtag: "etag-1" },
  { id: "local-2", externalId: "people/c2", externalEtag: "etag-2" },
];

describe("planContactMirror", () => {
  it("skips an unchanged etag and updates only a changed contact", () => {
    const plan = planContactMirror(
      local,
      [remote("people/c1"), remote("people/c2", "etag-new")],
      "incremental",
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([
      { id: "local-2", remote: expect.objectContaining({ externalEtag: "etag-new" }) },
    ]);
    expect(plan.toDelete).toEqual([]);
  });

  it("sweeps contacts absent from a full response but not from a delta", () => {
    expect(planContactMirror(local, [remote("people/c1")], "full").toDelete).toEqual([
      "local-2",
    ]);
    expect(
      planContactMirror(local, [remote("people/c1")], "incremental").toDelete,
    ).toEqual([]);
  });

  it("deletes only an explicit delta tombstone", () => {
    const plan = planContactMirror(
      local,
      [remote("people/c1", "etag-1", { deleted: true })],
      "incremental",
    );
    expect(plan.toDelete).toEqual(["local-1"]);
  });

  it("reuses a row whose People resource name changed", () => {
    const changed = remote("people/new", "etag-1", {
      previousExternalIds: ["people/c1"],
    });
    const plan = planContactMirror(local, [changed], "incremental");
    expect(plan.toInsert).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: "local-1", remote: changed }]);
  });
});

function remoteItem(
  kind: RemoteContactItem["kind"],
  value: string,
  patch: Partial<RemoteContactItem> = {},
): RemoteContactItem {
  return {
    kind,
    value,
    label: "",
    displayName: "",
    isPrimary: false,
    streetAddress: "",
    extendedAddress: "",
    poBox: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    countryCode: "",
    ...patch,
  };
}

describe("planContactItems", () => {
  it("matches phone formatting changes without replacing the local row", () => {
    const fields = remoteItem("phone", "+1 555 0100", {
      label: "mobile",
      isPrimary: true,
    });
    const plan = planContactItems(
      [{ id: "item-1", kind: "phone", value: "+1 (555) 0100", sortKey: "a0" }],
      [fields],
    );
    expect(plan).toEqual({
      toInsert: [],
      toUpdate: [{ id: "item-1", fields }],
      toDelete: [],
    });
  });

  it("inserts and deletes only the value-level difference", () => {
    const keep = remoteItem("email", "ada@example.com");
    const add = remoteItem("email", "work@example.com");
    const plan = planContactItems(
      [
        { id: "keep", kind: "email", value: "ADA@example.com", sortKey: "a0" },
        { id: "remove", kind: "url", value: "https://old.example", sortKey: "a0" },
      ],
      [keep, add],
    );
    expect(plan.toUpdate).toEqual([{ id: "keep", fields: keep }]);
    expect(plan.toInsert).toEqual([add]);
    expect(plan.toDelete).toEqual(["remove"]);
  });

  it("does not merge duplicate values into one row", () => {
    const duplicate = remoteItem("phone", "555-0100");
    const plan = planContactItems(
      [{ id: "first", kind: "phone", value: "5550100", sortKey: "a0" }],
      [duplicate, duplicate],
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toInsert).toHaveLength(1);
  });
});

describe("contactItemKey", () => {
  it("keeps unlike kinds distinct", () => {
    expect(contactItemKey({ kind: "phone", value: "123" })).not.toBe(
      contactItemKey({ kind: "user_defined", value: "123" }),
    );
  });
});
