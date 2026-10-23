import { describe, expect, it } from "vitest";

import { formatRows, scriptInvocation, tsxArguments } from "./productionAccess";

describe("scriptInvocation", () => {
  it("accepts a repository script and passes the rest through untouched", () => {
    expect(
      scriptInvocation(["scripts/ledger-rta-cutover.ts", "--user", "a@b.c", "--apply"]),
    ).toEqual({
      script: "scripts/ledger-rta-cutover.ts",
      args: ["--user", "a@b.c", "--apply"],
    });
  });

  it.each([
    [[]],
    [["rm", "-rf", "/"]],
    [["node", "scripts/backup.ts"]],
    [["scripts/../src/db/seed.ts"]],
    [["scripts/sub/dir.ts"]],
    [["/Users/x/scripts/evil.ts"]],
    [["scripts/smoke.mjs"]],
    [["scripts/.hidden.ts"]],
  ])("refuses anything but one script under scripts/: %j", (args) => {
    expect(() => scriptInvocation(args)).toThrow(/repository script/);
  });
});

describe("tsxArguments", () => {
  it("loads .env.local only when it exists, before the script", () => {
    const invocation = { script: "scripts/x.ts", args: ["--a"] };
    expect(tsxArguments(invocation, true)).toEqual([
      "tsx",
      "--env-file=.env.local",
      "scripts/x.ts",
      "--a",
    ]);
    expect(tsxArguments(invocation, false)).toEqual(["tsx", "scripts/x.ts", "--a"]);
  });
});

describe("formatRows", () => {
  it("prints a header and one tab-separated line per row, NULL as ∅", () => {
    expect(
      formatRows(
        ["id", "amount", "note"],
        [
          { id: "1", amount: "-16.95", note: null },
          { id: "2", amount: "5.00", note: "a\tb\nc" },
        ],
      ),
    ).toBe("id\tamount\tnote\n1\t-16.95\t∅\n2\t5.00\ta\\tb\\nc");
  });

  it("keeps a value that merely looks empty distinct from NULL", () => {
    expect(formatRows(["v"], [{ v: "" }, { v: null }])).toBe("v\n\n∅");
  });
});
