import { describe, expect, it } from "vitest";
import { resultTarget } from "./targets";
import type { FindResult, FindResultKind } from "./types";

function result(over: Partial<FindResult> & { kind: FindResultKind }): FindResult {
  return {
    id: `${over.kind}:r1`,
    typeLabel: "X",
    source: "outline",
    recordId: "r1",
    ownerId: null,
    name: "X",
    where: "",
    hits: [{ label: "Name", fieldClass: "name", snippet: "x" }],
    ...over,
  };
}

describe("resultTarget", () => {
  it("takes a node to the outline, revealed and open", () => {
    // `?select=` expands collapsed ancestors and clears an excluding zoom; `?detail=` opens
    // the drawer. A result wants both — `?detail=` alone lands on a row that may be hidden.
    expect(resultTarget(result({ kind: "task" })).href).toBe(
      "/plan/outline?select=r1&detail=r1",
    );
  });

  it("takes a sub-record to its owner, not to its own id", () => {
    const target = resultTarget(
      result({ kind: "node_item", recordId: "item1", ownerId: "node1" }),
    );
    expect(target.href).toBe("/plan/outline?select=node1&detail=node1");
  });

  it("takes a contact detail to the contact", () => {
    const target = resultTarget(
      result({ kind: "contact_item", recordId: "ci1", ownerId: "c1" }),
    );
    expect(target.href).toBe("/library/contacts?detail=c1");
  });

  it("takes a session exercise to its session", () => {
    const target = resultTarget(
      result({ kind: "workout_session", recordId: "se1", ownerId: "s1" }),
    );
    expect(target.href).toBe("/fitness/sessions/s1");
  });

  it("takes a session with no owner to itself", () => {
    expect(resultTarget(result({ kind: "workout_session", recordId: "s1" })).href).toBe(
      "/fitness/sessions/s1",
    );
  });

  it("lands the calendar on the appointment's own day", () => {
    const target = resultTarget(
      result({ kind: "appointment", where: "Schedule ▸ 2026-08-18" }),
    );
    expect(target.href).toBe("/schedule/calendar?date=2026-08-18");
  });

  it("falls back to the bare calendar when the day cannot be read", () => {
    const target = resultTarget(result({ kind: "appointment", where: "Schedule" }));
    expect(target.href).toBe("/schedule/calendar");
  });

  it("escapes an id so it cannot break out of the query string", () => {
    // Ids are opaque; a stray & or = would silently become a second parameter.
    expect(resultTarget(result({ kind: "contact", recordId: "a&b=c" })).href).toBe(
      "/library/contacts?detail=a%26b%3Dc",
    );
  });

  it("says which kinds actually open the record", () => {
    // These four views hold the open record in component state, so there is nothing to
    // deep-link to yet. Saying so is what keeps the command honest.
    const opensNothing: FindResultKind[] = [
      "appointment",
      "life_event",
      "metric",
      "recurring_bill",
      "recurring_spend",
    ];
    for (const kind of opensNothing) {
      expect(resultTarget(result({ kind })).opens, kind).toBe(false);
    }

    const opensRecord: FindResultKind[] = [
      "result_area",
      "goal",
      "project",
      "task",
      "node_item",
      "note",
      "contact",
      "contact_item",
      "resource",
      "job",
      "residence",
      "exercise",
      "workout_session",
      "transaction",
      "finance_account",
    ];
    for (const kind of opensRecord) {
      expect(resultTarget(result({ kind })).opens, kind).toBe(true);
    }
  });

  it("returns a non-empty href for every kind", () => {
    // The switch is exhaustive by type; this catches an empty string slipping through.
    const kinds: FindResultKind[] = [
      "result_area",
      "goal",
      "project",
      "task",
      "node_item",
      "note",
      "appointment",
      "contact",
      "contact_item",
      "resource",
      "job",
      "residence",
      "life_event",
      "metric",
      "exercise",
      "workout_session",
      "transaction",
      "finance_account",
      "recurring_bill",
      "recurring_spend",
    ];
    for (const kind of kinds) {
      expect(resultTarget(result({ kind })).href, kind).toMatch(/^\//);
    }
  });
});
