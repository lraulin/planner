import { describe, expect, it } from "vitest";
import { contactItemKindEnum } from "@/db/schema";
import {
  CONTACT_ITEM_KINDS,
  GRID_CONTACT_ITEM_KINDS,
  RENDERED_CONTACT_ITEM_KINDS,
  summarizeContactItem,
} from "./itemKinds";

/**
 * The failure worth guarding is a kind added to the enum with no config to render it, which
 * surfaces as an empty list rather than as an error. Same guard as the node-item config's.
 */
describe("contact item kind config", () => {
  it("covers every kind in the schema enum", () => {
    expect(Object.keys(CONTACT_ITEM_KINDS).sort()).toEqual(
      [...contactItemKindEnum.enumValues].sort(),
    );
  });

  it("gives every rendered kind a title, a singular and an empty-state line", () => {
    for (const [kind, config] of Object.entries(CONTACT_ITEM_KINDS)) {
      if (!config.rendered) continue;
      expect(config.title, kind).not.toBe("");
      expect(config.singular, kind).not.toBe("");
      expect(config.empty, kind).not.toBe("");
    }
  });

  it("makes every summary column an editable field too", () => {
    // A value you can see and cannot fix is worse than one you cannot see.
    for (const [kind, config] of Object.entries(CONTACT_ITEM_KINDS)) {
      for (const column of config.summary) {
        expect(
          config.fields.some((f) => f.key === column),
          `${kind} shows "${column}" but offers no editor for it`,
        ).toBe(true);
      }
    }
  });

  it("gives every field a non-empty label", () => {
    for (const [kind, config] of Object.entries(CONTACT_ITEM_KINDS)) {
      for (const field of config.fields) {
        expect(field.label, `${kind}.${field.key}`).not.toBe("");
      }
    }
  });

  it("lets every rendered kind choose a primary", () => {
    // The whole reason contact_items is a table and not a jsonb array is the primary flag;
    // a rendered kind without the control cannot use the index that enforces it.
    for (const kind of RENDERED_CONTACT_ITEM_KINDS) {
      expect(CONTACT_ITEM_KINDS[kind].hasPrimary, kind).toBe(true);
    }
  });

  it("renders exactly the four kinds Achieve's contact form has", () => {
    expect([...RENDERED_CONTACT_ITEM_KINDS]).toEqual([
      "phone",
      "email",
      "address",
      "url",
    ]);
  });

  it("loads only rendered kinds for the grid", () => {
    for (const kind of GRID_CONTACT_ITEM_KINDS) {
      expect(CONTACT_ITEM_KINDS[kind].rendered, kind).toBe(true);
    }
  });
});

describe("summarizeContactItem", () => {
  const blank = {
    value: "",
    streetAddress: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  };

  it("is the stored value for a phone, email or url", () => {
    expect(summarizeContactItem("phone", { ...blank, value: " +1 555 0100 " })).toBe(
      "+1 555 0100",
    );
  });

  it("builds an address from its parts, not from formattedValue", () => {
    // People's `formattedValue` is output-only, so it is blank on any address we created.
    expect(
      summarizeContactItem("address", {
        ...blank,
        value: "",
        streetAddress: "12 Baker St",
        city: "London",
        region: "Greater London",
        postalCode: "NW1",
        country: "UK",
      }),
    ).toBe("12 Baker St, London, Greater London, NW1, UK");
  });

  it("does not leave dangling separators when parts are missing", () => {
    expect(
      summarizeContactItem("address", { ...blank, city: "London", country: "UK" }),
    ).toBe("London, UK");
    expect(summarizeContactItem("address", { ...blank, region: "Kent" })).toBe("Kent");
  });

  it("is blank for an address with nothing in it", () => {
    expect(summarizeContactItem("address", blank)).toBe("");
  });
});
