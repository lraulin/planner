import { describe, expect, it } from "vitest";

import {
  isEmptyPlan,
  planSeed as buildPlan,
  type ExistingPayee,
  type SeedPlan,
  type SeedSource,
} from "./seed";

function planSeed(sources: readonly SeedSource[], existing: readonly ExistingPayee[]) {
  return buildPlan(sources, existing, (alias) =>
    /^(WM SUPERCENTER|WAL-?MART)/.test(alias) ? "Walmart" : null,
  );
}

/** The plan's own output, fed back in — how every idempotence check here is written. */
function asExisting(plan: SeedPlan): ExistingPayee[] {
  return plan.create.map((entry, index) => ({
    id: `payee-${index}`,
    name: entry.name,
    aliases: entry.aliases,
  }));
}

describe("planSeed", () => {
  it("folds two spellings a rule names into one payee", () => {
    // The knowledge that WM SUPERCENTER and WAL-MART are one company lives in rules.ts and
    // nowhere else. If this collapses to two payees, every Walmart total splits in half.
    const plan = planSeed(
      [{ description: "WM SUPERCENTER #1981" }, { description: "WAL-MART #1981" }],
      [],
    );

    expect(plan.create).toEqual([
      { name: "Walmart", aliases: ["WAL-MART", "WM SUPERCENTER"] },
    ]);
  });

  it("keeps distinct merchants apart when the rule that matches them supplies no name", () => {
    // `chewy` matches CHEWY, PETSMART and PETCO to categorise all three as Pets. Reading that
    // as "these are one merchant" would merge three shops that share nothing but a category.
    const plan = planSeed(
      [
        { description: "CHEWY.COM" },
        { description: "PETSMART #123" },
        { description: "PETCO 456" },
      ],
      [],
    );

    expect(plan.create.map((entry) => entry.name).sort()).toEqual([
      "CHEWY",
      "PETCO",
      "PETSMART",
    ]);
  });

  it("plans nothing on a second run over its own output", () => {
    // The property that makes this safe to re-run after every import instead of a one-shot
    // migration nobody dares touch twice.
    const sources = [
      { description: "WM SUPERCENTER #1981" },
      { description: "WAL-MART #1981" },
      { description: "CHEWY.COM" },
    ];
    const first = planSeed(sources, []);
    const second = planSeed(sources, asExisting(first));

    expect(isEmptyPlan(second)).toBe(true);
  });

  it("reports a conflict instead of reassigning an alias another payee holds", () => {
    // Two spellings of one merchant sitting on different payees is something a person did.
    // Picking a winner would silently undo it.
    const plan = planSeed(
      [
        { description: "WM SUPERCENTER #1" },
        { description: "WAL-MART #2" },
        { description: "WALMART #3" },
      ],
      [
        { id: "a", name: "Walmart", aliases: ["WM SUPERCENTER"] },
        { id: "b", name: "Walmart Grocery", aliases: ["WAL-MART"] },
      ],
    );

    expect(plan.create).toEqual([]);
    expect(plan.extend).toEqual([]);
    expect(plan.conflicts).toEqual([
      { name: "Walmart", aliases: ["WALMART"], heldBy: ["a", "b"] },
    ]);
  });

  it("sends a new spelling to the payee its siblings already sit on, under whatever name", () => {
    // The rename case. Re-seeding must not resurrect a payee called Walmart just because the
    // rule still says that is the canonical name.
    const plan = planSeed(
      [
        { description: "WM SUPERCENTER #1" },
        { description: "WAL-MART #2" },
        { description: "WALMART #3" },
      ],
      [{ id: "renamed", name: "Wally World", aliases: ["WM SUPERCENTER", "WAL-MART"] }],
    );

    expect(plan.create).toEqual([]);
    expect(plan.extend).toEqual([{ payeeId: "renamed", aliases: ["WALMART"] }]);
  });

  it("attaches to an existing payee of the same name rather than colliding with it", () => {
    // (user_id, lower(name)) is unique, so a create here would be rejected by the database.
    const plan = planSeed(
      [{ description: "WM SUPERCENTER #1" }],
      [{ id: "existing", name: "walmart", aliases: [] }],
    );

    expect(plan.create).toEqual([]);
    expect(plan.extend).toEqual([{ payeeId: "existing", aliases: ["WM SUPERCENTER"] }]);
  });

  it("creates no payee for a description that normalizes to nothing", () => {
    // A payee with a blank alias would claim every unnamed row in the register at once.
    const plan = planSeed(
      [{ description: "PAYPAL *" }, { description: "Withdrawal from " }],
      [],
    );

    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("gives a bare processor line the payee its counterparty names", () => {
    // Two PayPal rows the bank wrote identically are two different merchants. Without the
    // counterparty they would share one alias and no later edit could separate them.
    const plan = planSeed(
      [
        { description: "PAYPAL *", counterparty: "Blue Bottle Coffee" },
        { description: "PAYPAL *", counterparty: "Joe's Coffee" },
      ],
      [],
    );

    expect(plan.create.map((entry) => entry.name).sort()).toEqual([
      "BLUE BOTTLE COFFEE",
      "JOE'S COFFEE",
    ]);
  });

  it("distincts repeated sources, so the caller can hand over the whole register", () => {
    const plan = planSeed(
      Array.from({ length: 50 }, () => ({ description: "WM SUPERCENTER #1981" })),
      [],
    );

    expect(plan.create).toEqual([{ name: "Walmart", aliases: ["WM SUPERCENTER"] }]);
  });
});
