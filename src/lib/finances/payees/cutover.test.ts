import { describe, expect, it } from "vitest";
import { planPayeeCutover, type CutoverPayee, type PayeeCutoverInput } from "./cutover";

const PAYEE_A = "11111111-1111-4111-8111-111111111111";
const PAYEE_B = "22222222-2222-4222-8222-222222222222";
const BILL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BILL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SCHEDULE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function payee(
  id: string,
  name: string,
  aliases: string[],
  claim: CutoverPayee["claim"] = null,
): CutoverPayee {
  return { id, name, aliases, claim };
}

function input(overrides: Partial<PayeeCutoverInput> = {}): PayeeCutoverInput {
  return {
    payees: [payee(PAYEE_A, "Walmart", ["WM SUPERCENTER", "WAL-MART"])],
    commitments: [
      { kind: "bill", id: BILL_A, name: "Groceries", matchers: ["Walmart"] },
    ],
    schedules: [],
    transactions: [],
    ...overrides,
  };
}

describe("planPayeeCutover", () => {
  it("resolves a normalized alias before a case-insensitive payee name", () => {
    const plan = planPayeeCutover(
      input({
        payees: [
          payee(PAYEE_A, "Supercenter", ["WALMART"]),
          payee(PAYEE_B, "walmart", ["OTHER"]),
        ],
        commitments: [
          { kind: "bill", id: BILL_A, name: "Groceries", matchers: ["Walmart"] },
        ],
      }),
    );

    expect(plan.claims).toEqual([
      {
        payee: { type: "existing", id: PAYEE_A },
        commitment: { kind: "bill", id: BILL_A, name: "Groceries" },
      },
    ]);
  });

  it("falls back to an exact payee name without creating a duplicate", () => {
    const plan = planPayeeCutover(
      input({
        payees: [payee(PAYEE_A, "1Password", ["1PASSWORDTORONTOON"])],
        commitments: [
          { kind: "bill", id: BILL_A, name: "Password", matchers: ["1password"] },
        ],
      }),
    );

    expect(plan.creates).toEqual([]);
    expect(plan.claims[0]?.payee).toEqual({ type: "existing", id: PAYEE_A });
  });

  it("plans one placeholder for DOMINOS and rewrites its schedule reference", () => {
    const plan = planPayeeCutover(
      input({
        commitments: [
          { kind: "spend", id: BILL_A, name: "Pizza", matchers: ["DOMINOS"] },
        ],
        schedules: [
          {
            id: SCHEDULE,
            name: "Pizza night",
            conditions: [{ field: "payee", op: "is", value: "DOMINOS" }],
          },
        ],
      }),
    );

    expect(plan.canApply).toBe(true);
    expect(plan.creates).toEqual([
      { key: "DOMINOS", name: "DOMINOS", alias: "DOMINOS" },
    ]);
    expect(plan.claims[0]?.payee).toEqual({ type: "create", key: "DOMINOS" });
    expect(plan.scheduleUpdates[0]?.conditions).toEqual([
      { field: "payee", op: "is", value: "placeholder:DOMINOS" },
    ]);
  });

  it("deduplicates two legacy tokens that resolve to one claimed payee", () => {
    const plan = planPayeeCutover(
      input({
        commitments: [
          {
            kind: "bill",
            id: BILL_A,
            name: "Groceries",
            matchers: ["WM SUPERCENTER", "WAL-MART"],
          },
        ],
        transactions: [
          {
            id: "t1",
            legacyMerchant: "WM SUPERCENTER",
            payeeId: PAYEE_A,
            amountCents: -5_00,
          },
          {
            id: "t2",
            legacyMerchant: "WAL-MART",
            payeeId: PAYEE_A,
            amountCents: -7_00,
          },
        ],
      }),
    );

    expect(plan.claims).toHaveLength(1);
    expect(plan.parityDifferences).toEqual([]);
  });

  it("refuses one payee claimed by two commitments", () => {
    const plan = planPayeeCutover(
      input({
        commitments: [
          { kind: "bill", id: BILL_A, name: "One", matchers: ["Walmart"] },
          { kind: "bill", id: BILL_B, name: "Two", matchers: ["WAL-MART"] },
        ],
      }),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.commitments.map((row) => row.name)).toEqual([
      "One",
      "Two",
    ]);
  });

  it("reports malformed schedule JSON instead of partially rewriting it", () => {
    const plan = planPayeeCutover(
      input({
        schedules: [{ id: SCHEDULE, name: "Broken", conditions: { nope: true } }],
      }),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.malformedSchedules).toEqual([{ id: SCHEDULE, name: "Broken" }]);
    expect(plan.scheduleUpdates).toEqual([]);
  });

  it("reports an unknown UUID as dangling rather than minting a UUID-named payee", () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    const plan = planPayeeCutover(
      input({
        schedules: [
          {
            id: SCHEDULE,
            name: "Dangling",
            conditions: [{ field: "payee", op: "is", value: unknown }],
          },
        ],
      }),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.creates).toEqual([]);
    expect(plan.unresolvedValues).toEqual([
      { owner: 'schedule "Dangling"', value: unknown },
    ]);
  });

  it("blocks a cutover when the id join selects different transactions", () => {
    const plan = planPayeeCutover(
      input({
        transactions: [
          {
            id: "lost",
            legacyMerchant: "Walmart",
            payeeId: null,
            amountCents: -12_34,
          },
        ],
      }),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.parityDifferences).toEqual([
      {
        commitment: { kind: "bill", id: BILL_A, name: "Groceries" },
        legacyTransactionIds: ["lost"],
        payeeTransactionIds: [],
        legacyOnly: [
          {
            id: "lost",
            legacyMerchant: "Walmart",
            payeeId: null,
            amountCents: -12_34,
          },
        ],
        payeeOnly: [],
      },
    ]);
  });

  it("is a no-op when claims and schedule values are already ids", () => {
    const plan = planPayeeCutover(
      input({
        payees: [payee(PAYEE_A, "Walmart", ["WALMART"], { kind: "bill", id: BILL_A })],
        schedules: [
          {
            id: SCHEDULE,
            name: "Groceries",
            conditions: [{ field: "payee", op: "is", value: PAYEE_A }],
          },
        ],
      }),
    );

    expect(plan.canApply).toBe(true);
    expect(plan.isIdempotent).toBe(true);
    expect(plan.creates).toEqual([]);
    expect(plan.claims).toEqual([]);
    expect(plan.releases).toEqual([]);
    expect(plan.scheduleUpdates).toEqual([]);
  });

  it("releases a claim no legacy matcher still supports", () => {
    const plan = planPayeeCutover(
      input({
        payees: [payee(PAYEE_A, "Walmart", ["WALMART"], { kind: "bill", id: BILL_A })],
        commitments: [{ kind: "bill", id: BILL_A, name: "Groceries", matchers: [] }],
      }),
    );

    expect(plan.canApply).toBe(true);
    expect(plan.releases).toEqual([
      { payeeId: PAYEE_A, commitment: { kind: "bill", id: BILL_A } },
    ]);
    expect(plan.isIdempotent).toBe(false);
  });
});
