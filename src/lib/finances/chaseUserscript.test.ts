import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Drives `scripts/chase-pending.user.js` against a hand-built page, because the script runs
 * in a browser on chase.com and nothing else ever executes it.
 *
 * The thing worth pinning is the **sign**. Chase typesets a card credit as `−$181.05` with
 * U+2212, a script that only knows the ASCII hyphen captures `$181.05`, and the parser then
 * stores a payment as a purchase — with no error anywhere, which is how "Payment Thank You -
 * Web" was wrong twice. The first fix taught `AMOUNT` the typeset minus and missed the
 * `data-values` reader, which had its own copy of the pattern.
 */

/** Just enough DOM for the script: query results are looked up by selector string. */
type FakeNode = {
  textContent: string;
  innerText: string;
  parentElement: FakeNode | null;
  insertBefore: () => void;
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  querySelector: (selector: string) => FakeNode | null;
  querySelectorAll: (selector: string) => FakeNode[];
};

function node(
  options: {
    text?: string;
    attrs?: Record<string, string>;
    queries?: Record<string, FakeNode[]>;
    parent?: FakeNode | null;
  } = {},
): FakeNode {
  const { text = "", attrs = {}, queries = {}, parent = null } = options;
  return {
    textContent: text,
    innerText: text,
    parentElement: parent,
    insertBefore: () => undefined,
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    querySelector: (selector) => queries[selector]?.[0] ?? null,
    querySelectorAll: (selector) => queries[selector] ?? [],
  };
}

type Captured = {
  posted: { transactionDate: string; description: string; amount: string }[];
  completeness: Record<string, boolean>;
};

const POSTED_TABLE = '[id^="ACTIVITY-dataTableId"][id$="data-table"]';

/** Run the script on a page whose posted table holds `rows`, and return what it copies. */
async function capture(rows: FakeNode[]): Promise<Captured> {
  const table = node({ queries: { "tbody tr": rows } });
  const parent = node();
  const container = node({
    text: "You've reached the end of your account activity",
    parent,
  });
  const body = node({ text: "Current balance $1,234.56 ending in 9910" });

  let created: { listener: (() => void) | null } = { listener: null };
  const document = {
    body,
    getElementById: () => null,
    createElement: () => {
      created = { listener: null };
      const button = {
        ...node(),
        id: "",
        type: "",
        style: { cssText: "" },
        addEventListener: (_type: string, listener: () => void) => {
          created.listener = listener;
        },
      };
      return button;
    },
    querySelector: (selector: string) => {
      if (selector === "[data-testid='activity-container']") return container;
      if (selector === POSTED_TABLE) return table;
      return null;
    },
    querySelectorAll: () => [],
  };

  let copied = "";
  let done: () => void = () => undefined;
  const written = new Promise<void>((resolve) => {
    done = resolve;
  });

  const sandbox = {
    document,
    location: { search: "" },
    localStorage: { getItem: () => null, setItem: () => undefined },
    navigator: {},
    GM: {
      setClipboard: (text: string) => {
        copied = text;
        done();
        return Promise.resolve();
      },
    },
    URLSearchParams,
    setInterval: () => 0,
    Date,
  };
  const source = readFileSync(
    path.join(process.cwd(), "scripts/chase-pending.user.js"),
    "utf8",
  );
  vm.runInNewContext(source, sandbox);

  if (!created.listener) throw new Error("the script did not mount its button");
  created.listener();
  await written;

  const json = copied.split("\n").slice(1).join("\n");
  return JSON.parse(json) as Captured;
}

/** A row the way the cell reader sees it: a date, a description and an amount cell. */
function cellRow(date: string, description: string, amount: string): FakeNode {
  const cells = [date, description, amount].map((text) => node({ text }));
  return node({
    text: `${date} ${description} ${amount}`,
    queries: { "th, td": cells },
  });
}

/** A row the way the fallback sees it: no readable cells, one `data-values` string. */
function valuesRow(values: string): FakeNode {
  return node({ text: "", attrs: { "data-values": values } });
}

describe("Chase bank-page userscript", () => {
  it("keeps a typeset minus on a card credit read from data-values", async () => {
    const snapshot = await capture([
      valuesRow("Oct 5, 2026,PAYMENT THANK YOU - WEB,−$181.05"),
    ]);

    expect(snapshot.posted).toHaveLength(1);
    expect(snapshot.posted[0].amount).toBe("−$181.05");
    expect(snapshot.posted[0].description).toBe("PAYMENT THANK YOU - WEB");
  });

  it("keeps the sign on every spelling of a credit and leaves a charge unsigned", async () => {
    const snapshot = await capture([
      valuesRow("Oct 5, 2026,ASCII HYPHEN,-$10.00"),
      valuesRow("Oct 5, 2026,EN DASH,–$11.00"),
      valuesRow("Oct 5, 2026,ACCOUNTING,($12.00)"),
      valuesRow("Oct 5, 2026,A PURCHASE,$13.00"),
    ]);

    expect(snapshot.posted.map((row) => row.amount)).toEqual([
      "-$10.00",
      "–$11.00",
      "($12.00)",
      "$13.00",
    ]);
  });

  it("keeps a typeset minus on a card credit read from table cells", async () => {
    const snapshot = await capture([
      cellRow("Oct 5, 2026", "PAYMENT THANK YOU - WEB", "−$181.05"),
    ]);

    expect(snapshot.posted[0].amount).toBe("−$181.05");
  });
});
