import { describe, expect, it } from "vitest";
import {
  categoryPickerChoices,
  categoryPickerSections,
  commitCategoryPicker,
  defaultCategoryPickerChoice,
  isReadyToAssignDestination,
  READY_TO_ASSIGN_DESTINATION,
  visibleEnvelopeCatalog,
  type EnvelopePickerGroup,
  type EnvelopePickerOption,
} from "./groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";

function group(
  id: string,
  parentGroupId: string | null,
  sortKey: string,
  hidden = false,
): EnvelopePickerGroup {
  return { id, name: id, parentGroupId, sortKey, hidden };
}

function envelope(
  id: string,
  kind: EnvelopeKind,
  groupId: string | null,
  sortKey: string,
  hidden = false,
): EnvelopePickerOption {
  return {
    id,
    name: id,
    label: id,
    kind,
    groupId,
    sortKey,
    hidden,
  };
}

function outline(sections: ReturnType<typeof categoryPickerSections>) {
  return sections.map((entry) => ({
    type: entry.section.label,
    rows: entry.rows.map((row) => {
      if (row.kind === "create") return row.label;
      if (row.kind === "readyToAssign") return `rta:${row.label}`;
      const mark = row.hidden ? " hidden" : "";
      return row.kind === "heading"
        ? `h${row.depth}:${row.label}${mark}`
        : `e${row.depth}:${row.label}${mark}`;
    }),
  }));
}

describe("categoryPickerSections", () => {
  it("keeps Budget type order and leaves empty types in place for New {type}…", () => {
    const sections = categoryPickerSections([], [envelope("rent", "bill", null, "A")]);
    expect(sections.map((entry) => entry.section.label)).toEqual([
      "Income",
      "Regular spending",
      "Bills",
      "Savings",
    ]);
    expect(outline(sections)).toEqual([
      { type: "Income", rows: ["h0:Income", "New income…"] },
      { type: "Regular spending", rows: ["h0:Regular spending", "New envelope…"] },
      { type: "Bills", rows: ["h0:Bills", "e0:rent", "New bill…"] },
      { type: "Savings", rows: ["h0:Savings", "New savings…"] },
    ]);
  });

  it("nests groups in name order and sits ungrouped envelopes on the type", () => {
    const sections = categoryPickerSections(
      [
        group("food", null, "B"),
        group("produce", "food", "A"),
        group("dining", null, "D"),
      ],
      [
        envelope("coffee", "spending", null, "A"),
        envelope("apples", "spending", "produce", "A"),
        envelope("bread", "spending", "food", "B"),
        envelope("takeout", "spending", "dining", "A"),
        envelope("rent", "bill", null, "A"),
      ],
    );
    const spending = outline(sections).find(
      (entry) => entry.type === "Regular spending",
    );
    expect(spending?.rows).toEqual([
      "h0:Regular spending",
      "e0:coffee",
      "h0:dining",
      "e1:takeout",
      "h0:food",
      "e1:bread",
      "h1:produce",
      "e2:apples",
      "New envelope…",
    ]);
  });

  it("drops empty groups, including a group whose only child is an empty subgroup", () => {
    const sections = categoryPickerSections(
      [group("food", null, "A"), group("produce", "food", "A")],
      [envelope("rent", "bill", null, "A")],
    );
    const spending = outline(sections).find(
      (entry) => entry.type === "Regular spending",
    );
    expect(spending?.rows).toEqual(["h0:Regular spending", "New envelope…"]);
  });

  it("keeps a hidden envelope under a visible group and marks it", () => {
    const sections = categoryPickerSections(
      [group("visible", null, "A")],
      [
        envelope("shown", "spending", "visible", "A"),
        envelope("secret", "spending", "visible", "B", true),
      ],
    );
    const spending = outline(sections).find(
      (entry) => entry.type === "Regular spending",
    );
    expect(spending?.rows).toEqual([
      "h0:Regular spending",
      "h0:visible",
      "e1:secret hidden",
      "e1:shown",
      "New envelope…",
    ]);
  });

  it("keeps a hidden group and marks the heading and its envelopes", () => {
    const sections = categoryPickerSections(
      [group("hidden", null, "A", true)],
      [envelope("direct", "spending", "hidden", "A")],
    );
    const spending = outline(sections).find(
      (entry) => entry.type === "Regular spending",
    );
    expect(spending?.rows).toEqual([
      "h0:Regular spending",
      "h0:hidden hidden",
      "e1:direct hidden",
      "New envelope…",
    ]);
  });

  it("marks a nested group under a hidden ancestor even when the nested group is not itself hidden", () => {
    const sections = categoryPickerSections(
      [group("hidden", null, "A", true), group("nested", "hidden", "A")],
      [envelope("buried", "spending", "nested", "A")],
    );
    const spending = outline(sections).find(
      (entry) => entry.type === "Regular spending",
    );
    expect(spending?.rows).toEqual([
      "h0:Regular spending",
      "h0:hidden hidden",
      "h1:nested hidden",
      "e2:buried hidden",
      "New envelope…",
    ]);
  });

  it("filters a hidden envelope by name, not by the hidden marker", () => {
    const groups = [group("visible", null, "A")];
    const envelopes = [
      envelope("shown", "spending", "visible", "A"),
      envelope("secret", "spending", "visible", "B", true),
    ];

    expect(outline(categoryPickerSections(groups, envelopes, "secret"))).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "h0:visible", "e1:secret hidden"],
      },
    ]);
    expect(categoryPickerSections(groups, envelopes, "(hidden)")).toEqual([]);
  });

  it("renders a mixed group under each type that has a descendant envelope there", () => {
    const sections = categoryPickerSections(
      [group("house", null, "A")],
      [
        envelope("repairs", "spending", "house", "A"),
        envelope("mortgage", "bill", "house", "B"),
      ],
    );
    expect(outline(sections)).toEqual([
      { type: "Income", rows: ["h0:Income", "New income…"] },
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "h0:house", "e1:repairs", "New envelope…"],
      },
      { type: "Bills", rows: ["h0:Bills", "h0:house", "e1:mortgage", "New bill…"] },
      { type: "Savings", rows: ["h0:Savings", "New savings…"] },
    ]);
  });

  it("filters by envelope name, ancestor group, and type label without re-ranking", () => {
    const groups = [group("food", null, "B")];
    const envelopes = [
      envelope("coffee", "spending", null, "A"),
      envelope("groceries", "spending", "food", "A"),
      envelope("rent", "bill", null, "A"),
    ];

    expect(outline(categoryPickerSections(groups, envelopes, "groc"))).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "h0:food", "e1:groceries"],
      },
    ]);

    expect(outline(categoryPickerSections(groups, envelopes, "food"))).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "h0:food", "e1:groceries"],
      },
    ]);

    const byType = categoryPickerSections(groups, envelopes, "regular");
    expect(outline(byType)).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "e0:coffee", "h0:food", "e1:groceries"],
      },
    ]);
    expect(categoryPickerChoices(byType).map((row) => row.id)).toEqual([
      "coffee",
      "groceries",
    ]);
  });

  it("keeps New {type}… when the query is empty or matches the create label", () => {
    const sections = categoryPickerSections(
      [],
      [envelope("rent", "bill", null, "A")],
      "new bill",
    );
    expect(outline(sections)).toEqual([
      { type: "Bills", rows: ["h0:Bills", "New bill…"] },
    ]);
  });

  it("marks the type heading apart from a group that shares its name", () => {
    const sections = categoryPickerSections(
      [{ id: "g", name: "Income", parentGroupId: null, sortKey: "A", hidden: false }],
      [envelope("salary", "income", "g", "A")],
    );
    const income = sections.find((entry) => entry.section.kind === "income");
    expect(
      income?.rows
        .filter((row) => row.kind === "heading")
        .map((row) => [row.label, row.scope]),
    ).toEqual([
      ["Income", "type"],
      ["Income", "group"],
    ]);
  });

  it("drops empty types when the query matches neither the type, create label, nor an envelope", () => {
    const sections = categoryPickerSections(
      [],
      [envelope("rent", "bill", null, "A")],
      "xyz",
    );
    expect(sections).toEqual([]);
  });
});

describe("categoryPickerChoices", () => {
  it("walks envelopes and create rows, skipping headings", () => {
    const choices = categoryPickerChoices(
      categoryPickerSections([], [envelope("rent", "bill", null, "A")]),
    );
    expect(choices.map((row) => row.id)).toEqual([
      "__new__:income",
      "__new__:spending",
      "rent",
      "__new__:bill",
      "__new__:savings",
    ]);
    expect(defaultCategoryPickerChoice(choices)).toBe(2);
  });

  it("highlights the first create row when no envelopes remain", () => {
    const choices = categoryPickerChoices(categoryPickerSections([], [], "new income"));
    expect(choices.map((row) => row.id)).toEqual(["__new__:income"]);
    expect(defaultCategoryPickerChoice(choices)).toBe(0);
  });
});

describe("commitCategoryPicker", () => {
  it("clears on an empty draft and restores when nothing is highlighted", () => {
    expect(commitCategoryPicker("", null, true)).toEqual({ action: "clear" });
    expect(commitCategoryPicker("rent", null, true)).toEqual({ action: "restore" });
  });

  it("commits the highlighted envelope; create only when allowCreate is set", () => {
    expect(
      commitCategoryPicker(
        "rent",
        { kind: "envelope", id: "rent", label: "rent", depth: 0, hidden: false },
        false,
      ),
    ).toEqual({ action: "envelope", id: "rent" });
    expect(
      commitCategoryPicker(
        "new",
        {
          kind: "create",
          id: "__new__:bill",
          label: "New bill…",
          envelopeKind: "bill",
        },
        false,
      ),
    ).toEqual({ action: "restore" });
    expect(
      commitCategoryPicker(
        "new",
        {
          kind: "create",
          id: "__new__:bill",
          label: "New bill…",
          envelopeKind: "bill",
        },
        true,
      ),
    ).toEqual({ action: "create", envelopeKind: "bill" });
  });

  it("restores on an empty draft when the destination cannot uncategorise", () => {
    expect(commitCategoryPicker("", null, true, false)).toEqual({
      action: "restore",
    });
    expect(commitCategoryPicker("   ", null, true, false)).toEqual({
      action: "restore",
    });
  });

  it("commits Ready to Assign when that row is highlighted", () => {
    expect(
      commitCategoryPicker(
        "ready",
        {
          kind: "readyToAssign",
          id: READY_TO_ASSIGN_DESTINATION,
          label: "Ready to Assign",
        },
        false,
        false,
      ),
    ).toEqual({ action: "readyToAssign" });
  });
});

describe("categoryPickerSections — includeCreate: false", () => {
  it("omits New {type}… and drops a type that has no envelopes left", () => {
    const sections = categoryPickerSections(
      [],
      [envelope("rent", "bill", null, "A")],
      "",
      { includeCreate: false },
    );
    expect(outline(sections)).toEqual([
      { type: "Bills", rows: ["h0:Bills", "e0:rent"] },
    ]);
  });
});

describe("categoryPickerSections — includeReadyToAssign", () => {
  const rent = envelope("rent", "bill", null, "A");

  it("omits Ready to Assign unless opted in", () => {
    const off = categoryPickerSections([], [rent], "", { includeCreate: false });
    expect(off.map((entry) => entry.section.kind)).toEqual(["bill"]);
    expect(isReadyToAssignDestination(READY_TO_ASSIGN_DESTINATION)).toBe(true);
    expect(isReadyToAssignDestination("rent")).toBe(false);
  });

  it("sits first, above Income, and is the default choice", () => {
    const sections = categoryPickerSections([], [rent], "", {
      includeCreate: false,
      includeReadyToAssign: true,
      readyToAssignDetail: "-$7.41",
    });
    expect(outline(sections)).toEqual([
      { type: "Ready to Assign", rows: ["rta:Ready to Assign"] },
      { type: "Bills", rows: ["h0:Bills", "e0:rent"] },
    ]);
    const ready = sections[0]?.rows[0];
    expect(ready).toMatchObject({
      kind: "readyToAssign",
      id: READY_TO_ASSIGN_DESTINATION,
      label: "Ready to Assign",
      detail: "-$7.41",
    });
    const choices = categoryPickerChoices(sections);
    expect(choices[0]?.kind).toBe("readyToAssign");
    expect(defaultCategoryPickerChoice(choices)).toBe(0);
  });

  it("matches the label, not the amount suffix, and drops when the query misses", () => {
    const options = {
      includeCreate: false,
      includeReadyToAssign: true,
      readyToAssignDetail: "$12.34",
    };
    expect(
      outline(categoryPickerSections([], [rent], "ready", options)).map(
        (entry) => entry.type,
      ),
    ).toEqual(["Ready to Assign"]);
    expect(outline(categoryPickerSections([], [rent], "12.34", options))).toEqual([]);
    expect(
      outline(categoryPickerSections([], [rent], "rent", options)).map(
        (entry) => entry.type,
      ),
    ).toEqual(["Bills"]);
  });
});

describe("categoryPickerSections — detail is not a filter token", () => {
  it("does not match Available-amount text on an envelope row", () => {
    const envelopes: EnvelopePickerOption[] = [
      { ...envelope("groceries", "spending", null, "A"), detail: "$12.34" },
      envelope("rent", "bill", null, "A"),
    ];
    expect(outline(categoryPickerSections([], envelopes, "12.34"))).toEqual([]);
    expect(outline(categoryPickerSections([], envelopes, "groc"))).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "e0:groceries"],
      },
    ]);
    const groc = categoryPickerSections([], envelopes, "groc")[0]?.rows.find(
      (row) => row.kind === "envelope",
    );
    expect(groc).toMatchObject({ kind: "envelope", id: "groceries", detail: "$12.34" });
  });
});

describe("visibleEnvelopeCatalog", () => {
  it("drops hidden envelopes and anything under a hidden group", () => {
    const catalog = visibleEnvelopeCatalog({
      groups: [
        group("visible", null, "A"),
        group("hidden", null, "B", true),
        group("nested", "hidden", "A"),
      ],
      envelopes: [
        envelope("shown", "spending", "visible", "A"),
        envelope("secret", "spending", "visible", "B", true),
        envelope("buried", "spending", "nested", "A"),
        envelope("direct", "spending", "hidden", "A"),
        envelope("ungrouped", "spending", null, "C"),
      ],
    });
    expect(catalog.groups.map((group) => group.id)).toEqual(["visible"]);
    expect(catalog.envelopes.map((envelope) => envelope.id)).toEqual([
      "shown",
      "ungrouped",
    ]);
  });
});
