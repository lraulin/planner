import { describe, expect, it } from "vitest";
import { nodeItemKindEnum } from "@/db/schema";
import { columnLabel, COLUMN_LABELS, ITEM_KINDS } from "./itemKinds";

/**
 * `itemKinds.ts` is the single config that drives all fourteen repeating lists, so the
 * failure mode worth guarding is a kind added to the enum without a config to render it —
 * which would otherwise surface as an empty tab rather than an error.
 */
describe("item kind config", () => {
  it("covers every kind in the schema enum", () => {
    expect(Object.keys(ITEM_KINDS).sort()).toEqual(
      [...nodeItemKindEnum.enumValues].sort(),
    );
  });

  it("gives every kind a title, a singular, and an empty-state line", () => {
    for (const [kind, config] of Object.entries(ITEM_KINDS)) {
      expect(config.title, kind).not.toBe("");
      expect(config.singular, kind).not.toBe("");
      expect(config.empty, kind).not.toBe("");
    }
  });

  it("makes every summary column an editable field too", () => {
    for (const [kind, config] of Object.entries(ITEM_KINDS)) {
      for (const column of config.columns) {
        const field = config.fields.find((f) => f.key === column);
        expect(
          field,
          `${kind} shows "${column}" but offers no editor for it`,
        ).toBeDefined();
      }
    }
  });

  it("labels every column it can render", () => {
    for (const config of Object.values(ITEM_KINDS)) {
      for (const column of config.columns) {
        expect(columnLabel(config, column)).not.toBe("");
        expect(COLUMN_LABELS[column]).toBeDefined();
      }
    }
  });

  it("names a column after the kind's own field label where it has one", () => {
    // Achieve heads the same column "Summary" on Issues and "Name" on Contacts.
    expect(columnLabel(ITEM_KINDS.issue, "title")).toBe("Summary");
    expect(columnLabel(ITEM_KINDS.contact, "title")).toBe("Name");
    expect(columnLabel(ITEM_KINDS.objective, "title")).toBe("Title");
  });

  it("gives every select field its options", () => {
    for (const [kind, config] of Object.entries(ITEM_KINDS)) {
      for (const field of config.fields) {
        if (field.kind === "select") {
          expect(field.options?.length, `${kind}.${field.key}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
