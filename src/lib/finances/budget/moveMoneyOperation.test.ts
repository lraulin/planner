import { describe, expect, it } from "vitest";

import { READY_TO_ASSIGN_DESTINATION } from "./groupEnvelopeOptions";
import { moveMoneyOperation } from "./moveMoneyOperation";

const groceries = { id: "groceries", name: "Groceries" };
const dining = { id: "dining", name: "Dining out" };

describe("moveMoneyOperation", () => {
  it("unassigns from the source when the destination is Ready to Assign", () => {
    expect(
      moveMoneyOperation(
        "2026-10-01",
        groceries,
        [dining],
        READY_TO_ASSIGN_DESTINATION,
        2_500,
      ),
    ).toEqual({
      kind: "unassign",
      month: "2026-10-01",
      from: groceries,
      amountCents: 2_500,
    });
  });

  it("transfers to the picked envelope, named as the target list names it", () => {
    expect(
      moveMoneyOperation("2026-10-01", groceries, [dining], "dining", 1_000),
    ).toEqual({
      kind: "transfer",
      month: "2026-10-01",
      from: groceries,
      to: dining,
      amountCents: 1_000,
    });
  });

  it("writes nothing for a destination the dialog never offered", () => {
    expect(
      moveMoneyOperation("2026-10-01", groceries, [dining], "rent", 1_000),
    ).toBeNull();
  });

  it("sends only the envelope's id and name, not the whole row", () => {
    const row = { ...groceries, balanceCents: 9_000 };
    const operation = moveMoneyOperation("2026-10-01", row, [dining], "dining", 1);
    expect(operation).toMatchObject({ from: { id: "groceries", name: "Groceries" } });
    expect(operation && "from" in operation ? operation.from : null).not.toHaveProperty(
      "balanceCents",
    );
  });
});
