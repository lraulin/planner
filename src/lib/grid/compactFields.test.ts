import { describe, expect, it } from "vitest";
import { resolveCompactFields, type CompactColumn } from "@/lib/grid/compactFields";

const cols = (...specs: (string | CompactColumn)[]): CompactColumn[] =>
  specs.map((spec) => (typeof spec === "string" ? { id: spec } : spec));

const ids = (columns: CompactColumn[]) => columns.map((column) => column.id);

describe("resolveCompactFields", () => {
  it("picks name as primary and priority as accent by id", () => {
    const result = resolveCompactFields(
      cols("priority", "name", "effort", "deadline", "state"),
    );

    expect(result.primary?.id).toBe("name");
    expect(result.accent?.id).toBe("priority");
    expect(ids(result.meta)).toEqual(["effort", "deadline", "state"]);
  });

  it("caps meta and drops the overflow rather than eliding it later", () => {
    const result = resolveCompactFields(
      cols("priority", "name", "a", "b", "c", "d", "e"),
    );

    expect(ids(result.meta)).toEqual(["a", "b", "c"]);
  });

  it("honours an explicit maxMeta", () => {
    const result = resolveCompactFields(cols("name", "a", "b", "c"), {
      maxMeta: 1,
    });

    expect(ids(result.meta)).toEqual(["a"]);
  });

  it("lets a declared role beat the id defaults", () => {
    const result = resolveCompactFields(
      cols("name", { id: "subject", compact: "primary" }, "priority"),
    );

    // `subject` claimed primary explicitly, so `name` is not the title — it becomes meta
    // rather than vanishing.
    expect(result.primary?.id).toBe("subject");
    expect(result.accent?.id).toBe("priority");
    expect(ids(result.meta)).toEqual(["name"]);
  });

  it("excludes columns marked hidden from every slot", () => {
    const result = resolveCompactFields(
      cols("name", { id: "internalId", compact: "hidden" }, "effort"),
    );

    expect(ids(result.meta)).toEqual(["effort"]);
    expect(result.primary?.id).toBe("name");
  });

  it("never lets a hidden column become the fallback primary", () => {
    const result = resolveCompactFields(
      cols({ id: "junk", compact: "hidden" }, "somethingElse"),
    );

    expect(result.primary?.id).toBe("somethingElse");
  });

  it("falls back to the first column when nothing looks like a title", () => {
    const result = resolveCompactFields(cols("lap", "score", "rank"));

    expect(result.primary?.id).toBe("lap");
    expect(result.accent).toBeNull();
    expect(ids(result.meta)).toEqual(["score", "rank"]);
  });

  it("does not let the accent column double as the fallback primary", () => {
    const result = resolveCompactFields(cols("priority", "score"));

    expect(result.accent?.id).toBe("priority");
    expect(result.primary?.id).toBe("score");
    expect(result.meta).toEqual([]);
  });

  it("still yields a primary when the accent is the only column", () => {
    const result = resolveCompactFields(cols("priority"));

    // Accent wins the column, and there is nothing left to title the row with — better an
    // empty title than a row that renders as a bare colour bar with no text at all.
    expect(result.accent?.id).toBe("priority");
    expect(result.primary).toBeNull();
  });

  it("handles an empty column set", () => {
    expect(resolveCompactFields([])).toEqual({
      leading: null,
      primary: null,
      accent: null,
      meta: [],
    });
  });

  it("only takes a leading column when one asks for it", () => {
    // No id-based default: a control appearing in a compact row by accident is worse than
    // one that is missing.
    expect(resolveCompactFields(cols("check", "title")).leading).toBeNull();

    const result = resolveCompactFields(
      cols({ id: "check", compact: "leading" }, "priority", "title", "state"),
    );
    expect(result.leading?.id).toBe("check");
    expect(result.primary?.id).toBe("title");
    expect(result.accent?.id).toBe("priority");
    expect(ids(result.meta)).toEqual(["state"]);
  });

  it("does not also emit the leading column as a meta chip", () => {
    const result = resolveCompactFields(
      cols({ id: "check", compact: "leading" }, "a", "b"),
    );

    expect(ids(result.meta)).toEqual(["b"]);
    expect(result.primary?.id).toBe("a");
  });

  it("does not let the leading column become the fallback primary", () => {
    const result = resolveCompactFields(
      cols({ id: "check", compact: "leading" }, "score"),
    );

    expect(result.primary?.id).toBe("score");
  });

  it("prefers name over title when a grid has both", () => {
    const result = resolveCompactFields(cols("title", "name"));

    expect(result.primary?.id).toBe("name");
    expect(ids(result.meta)).toEqual(["title"]);
  });
});
