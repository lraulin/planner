import { describe, expect, it } from "vitest";
import {
  matchPaypalResolutions,
  unresolvedPaypalInflows,
  type PaypalResolution,
} from "./paypalMatch";

function row(id: string, date: string, amountCents: number, description = "") {
  return { id, transactionDate: date, amountCents, description };
}

function resolution(
  externalId: string,
  date: string,
  amountCents: number,
  counterparty: string,
): PaypalResolution {
  return {
    externalId,
    date,
    amountCents,
    counterparty,
    direction: amountCents > 0 ? "in" : "out",
  };
}

describe("matchPaypalResolutions", () => {
  it("pairs a deposit to the receipt that names who sent it", () => {
    const { byRowId } = matchPaypalResolutions(
      [row("gift", "2025-04-20", 200000)],
      [resolution("0LT3288171837814B", "2025-04-20", 200000, "Dennis Raulin")],
    );
    expect(byRowId.get("gift")?.counterparty).toBe("Dennis Raulin");
  });

  it("does not use the description, which never agrees", () => {
    // The whole reason this matcher exists: the bank names the rail, PayPal names the person.
    const { byRowId } = matchPaypalResolutions(
      [
        row(
          "gift",
          "2025-04-20",
          200000,
          "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        ),
      ],
      [resolution("pp-1", "2025-04-20", 200000, "Dennis Raulin")],
    );
    expect(byRowId.get("gift")?.counterparty).toBe("Dennis Raulin");
  });

  it("keeps two same-day, same-amount rows from collapsing", () => {
    const { byRowId } = matchPaypalResolutions(
      [row("a", "2025-03-13", -1801), row("b", "2025-03-13", -1801)],
      [
        resolution("pp-a", "2025-03-13", -1801, "Spotify USA Inc"),
        resolution("pp-b", "2025-03-13", -1801, "Spotify USA Inc"),
      ],
    );
    expect(byRowId.size).toBe(2);
    expect(byRowId.get("a")?.externalId).toBe("pp-a");
    expect(byRowId.get("b")?.externalId).toBe("pp-b");
  });

  it("prefers the same-day row over a closer-looking neighbour of the same size", () => {
    const { byRowId } = matchPaypalResolutions(
      [row("near", "2025-04-21", 200000), row("same", "2025-04-20", 200000)],
      [resolution("pp-1", "2025-04-20", 200000, "Dennis Raulin")],
    );
    expect(byRowId.get("same")?.counterparty).toBe("Dennis Raulin");
    expect(byRowId.has("near")).toBe(false);
  });

  it("refuses a pair further apart than the posting window", () => {
    const { byRowId } = matchPaypalResolutions(
      [row("late", "2025-04-27", 200000)],
      [resolution("pp-1", "2025-04-20", 200000, "Dennis Raulin")],
    );
    expect(byRowId.size).toBe(0);
  });

  it("does not reuse a row for a second resolution", () => {
    const { byRowId } = matchPaypalResolutions(
      [row("only", "2025-04-20", 200000)],
      [
        resolution("first", "2025-04-20", 200000, "Dennis Raulin"),
        resolution("second", "2025-04-20", 200000, "Someone Else"),
      ],
    );
    expect(byRowId.size).toBe(1);
    expect(byRowId.get("only")?.externalId).toBe("first");
  });
});

describe("unresolvedPaypalInflows", () => {
  it("names the two 2024 gifts that predate the supplied statements", () => {
    const unresolved = unresolvedPaypalInflows(
      [
        row(
          "feb",
          "2024-02-02",
          462517,
          "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        ),
        row(
          "mar",
          "2024-03-21",
          700000,
          "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        ),
        row(
          "apr",
          "2025-04-20",
          200000,
          "Deposit from PAYPAL from LEE RAULIN TRANSFER",
        ),
      ],
      [resolution("0LT3288171837814B", "2025-04-20", 200000, "Dennis Raulin")],
    );

    expect(unresolved).toEqual([
      {
        rowId: "feb",
        date: "2024-02-02",
        amountCents: 462517,
        reason: "No PayPal statement covers this date (statements start 2025-04-20)",
      },
      {
        rowId: "mar",
        date: "2024-03-21",
        amountCents: 700000,
        reason: "No PayPal statement covers this date (statements start 2025-04-20)",
      },
    ]);
  });

  it("ignores an inbound that is not a PayPal deposit", () => {
    const unresolved = unresolvedPaypalInflows(
      [row("tax", "2025-04-21", 83400, "Deposit from ST. OF MARYLAND TAX REFUND")],
      [resolution("pp-1", "2025-04-20", 200000, "Dennis Raulin")],
    );
    expect(unresolved).toEqual([]);
  });
});
