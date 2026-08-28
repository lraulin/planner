import { describe, expect, it } from "vitest";

import { draftsFromTemplates, draftsToTemplates, newDraft, type Draft } from "./draft";
import { parseTemplates, type Template } from "./types";

function simple(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "line-1",
    type: "simple",
    monthly: "",
    limit: "",
    hold: false,
    ...overrides,
  } as Draft;
}

describe("draftsToTemplates", () => {
  it("rejects a simple line with neither an amount nor a limit", () => {
    const result = draftsToTemplates([simple()]);
    expect(result.ok).toBe(false);
  });

  it("keeps a simple line that has only a limit — that is the refill case", () => {
    const result = draftsToTemplates([simple({ limit: "150", hold: true })]);
    expect(result).toEqual({
      ok: true,
      templates: [
        {
          id: "line-1",
          directive: "template",
          type: "simple",
          priority: 0,
          limit: { amountCents: 15_000, hold: true },
        },
      ],
    });
  });

  it("reads dollars into integer cents, rounding the third decimal rather than truncating", () => {
    const result = draftsToTemplates([simple({ monthly: "$1,234.567" })]);
    expect(result.ok && result.templates[0]).toMatchObject({ monthlyCents: 123_457 });
  });

  it("refuses a zero or negative amount instead of storing a template that assigns nothing", () => {
    expect(draftsToTemplates([simple({ monthly: "0" })]).ok).toBe(false);
    expect(draftsToTemplates([simple({ monthly: "-20" })]).ok).toBe(false);
  });

  it("refuses a by line whose month is not a real month", () => {
    const draft: Draft = {
      id: "line-2",
      type: "by",
      amount: "10000",
      month: "2026-13",
      repeat: "",
      annual: false,
    };
    expect(draftsToTemplates([draft]).ok).toBe(false);
  });

  it("drops annual when there is no repeat — annual only means anything as a unit for it", () => {
    const draft: Draft = {
      id: "line-3",
      type: "by",
      amount: "600",
      month: "2026-12",
      repeat: "",
      annual: true,
    };
    const result = draftsToTemplates([draft]);
    expect(result.ok && result.templates[0]).toEqual({
      id: "line-3",
      directive: "template",
      type: "by",
      priority: 0,
      amountCents: 60_000,
      month: "2026-12",
    });
  });

  it("refuses a second remainder line on the same envelope", () => {
    const one: Draft = { id: "a", type: "remainder", weight: "1" };
    const two: Draft = { id: "b", type: "remainder", weight: "2" };
    expect(draftsToTemplates([one, two]).ok).toBe(false);
    expect(draftsToTemplates([one]).ok).toBe(true);
  });

  it("refuses a fractional weight rather than rounding it behind the user's back", () => {
    const draft: Draft = { id: "c", type: "remainder", weight: "1.5" };
    expect(draftsToTemplates([draft]).ok).toBe(false);
  });

  it("produces templates the stored-shape parser accepts", () => {
    const drafts: Draft[] = [
      simple({ monthly: "50", limit: "150", hold: false }),
      {
        id: "b",
        type: "by",
        amount: "10000",
        month: "2026-12",
        repeat: "1",
        annual: true,
      },
      { id: "r", type: "remainder", weight: "2" },
    ];
    const result = draftsToTemplates(drafts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(parseTemplates(JSON.parse(JSON.stringify(result.templates)))).toEqual(
      result.templates,
    );
  });
});

describe("draftsFromTemplates", () => {
  it("round-trips every type back to the same templates", () => {
    const templates: Template[] = [
      {
        id: "a",
        directive: "template",
        type: "simple",
        priority: 0,
        monthlyCents: 5_000,
        limit: { amountCents: 15_000, hold: true },
      },
      {
        id: "c",
        directive: "template",
        type: "by",
        priority: 0,
        amountCents: 1_000_000,
        month: "2026-12",
        repeat: 1,
        annual: true,
      },
      { id: "d", directive: "template", type: "remainder", priority: null, weight: 3 },
    ];
    const result = draftsToTemplates(draftsFromTemplates(templates));
    expect(result).toEqual({ ok: true, templates });
  });
});

describe("weekly drafts", () => {
  it("converts a weekday and an amount into a weekly template", () => {
    const result = draftsToTemplates([
      { id: "line-1", type: "weekly", weekday: 5, amount: "45" },
    ]);
    expect(result).toEqual({
      ok: true,
      templates: [
        {
          id: "line-1",
          directive: "template",
          type: "weekly",
          priority: 0,
          amountCents: 4_500,
          weekday: 5,
        },
      ],
    });
  });

  it("rejects a weekly line with no amount", () => {
    const result = draftsToTemplates([
      { id: "line-1", type: "weekly", weekday: 0, amount: "" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("round-trips a weekly line through drafts", () => {
    const templates: Template[] = [
      {
        id: "w1",
        directive: "template",
        type: "weekly",
        priority: 0,
        amountCents: 18_000,
        weekday: 0,
      },
    ];
    expect(draftsToTemplates(draftsFromTemplates(templates))).toEqual({
      ok: true,
      templates,
    });
  });
});

describe("newDraft", () => {
  it("defaults a weekly line to Sunday with no amount typed yet", () => {
    const draft = newDraft("weekly", "2026-08");
    expect(draft).toMatchObject({ type: "weekly", weekday: 0, amount: "" });
  });

  it("defaults a by line to a month that is not already in the past", () => {
    const draft = newDraft("by", "2026-08");
    expect(draft.type === "by" && draft.month >= "2026-08").toBe(true);
  });
});
