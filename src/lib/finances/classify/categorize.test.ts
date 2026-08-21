import { describe, expect, it } from "vitest";
import { categorize } from "./categorize";
import { CLASSIFY_RULES } from "./rules";

/** Real descriptions and their real bank labels, as imported. */

describe("categorize", () => {
  it("collapses both Walmart spellings onto one merchant", () => {
    // These normalize differently and always will — the rule is what equates them.
    const supercenter = categorize("WM SUPERCENTER #1981", "Merchandise");
    const walmart = categorize("WAL-MART #1981", "Merchandise");

    expect(supercenter.merchant).toBe("Walmart");
    expect(walmart.merchant).toBe("Walmart");
    expect(supercenter.category).toBe("Groceries");
    expect(walmart.category).toBe("Groceries");
  });

  it("collapses all three rent payer strings onto one merchant", () => {
    const spellings = [
      "Withdrawal from TURBOTENANT.COM RENT:RAULI",
      "Withdrawal from TurboTenant RENT:RAULI",
      "Withdrawal from RENT:RAULIN RENT:RAULI",
      "Withdrawal from TURBOTENANT RENT:RAULI",
    ];
    for (const spelling of spellings) {
      const result = categorize(spelling, "");
      expect(result.merchant).toBe("Rent");
      expect(result.category).toBe("Rent & Housing");
    }
  });

  it("prefers a description rule over the bank's coarser label", () => {
    // Capital One files this as Merchandise; it is a grocery run.
    expect(categorize("WM SUPERCENTER #1981", "Merchandise").category).toBe(
      "Groceries",
    );
    // Chase files a video game as Internet.
    expect(categorize("STEAMGAMES.COM 4259522985", "Internet").category).toBe("Games");
  });

  it("falls back to the bank's label when no rule matches", () => {
    const result = categorize("SOME UNKNOWN CAFE", "Dining");
    expect(result.category).toBe("Dining");
    expect(result.ruleId).toBeNull();
  });

  it("leaves a row uncategorised when the bank's label is too broad to guess from", () => {
    // Mapping `Merchandise` to Shopping would file groceries under Shopping and make both
    // numbers wrong. A visible gap is better than a confident error.
    expect(categorize("MYSTERY STORE", "Merchandise").category).toBeNull();
    expect(categorize("MYSTERY STORE", "Purchase").category).toBeNull();
    expect(categorize("MYSTERY STORE", "").category).toBeNull();
  });

  it("files pet insurance under Pets, not Insurance", () => {
    // Ordering test: a bare Insurance rule must not outrank the specific one.
    const result = categorize("METLIFE PET", "Insurance");
    expect(result.category).toBe("Pets");
    expect(result.merchant).toBe("MetLife Pet");
  });

  it("separates interest and fees from spending", () => {
    const charged = categorize("INTEREST CHARGE:PURCHASES", "Fee/Interest Charge");
    expect(charged.flow).toBe("interest_fee");
    expect(charged.category).toBe("Fees & Interest");

    const earned = categorize("Monthly Interest Paid", "");
    expect(earned.flow).toBe("interest_fee");
    expect(earned.merchant).toBe("Interest Paid");
  });

  it("recognises monthly VA benefits as income", () => {
    // Monthly, so the biweekly cadence detector will never see it.
    const result = categorize("Deposit from VACP TREAS 310 XXVA BENEF", "");
    expect(result.flow).toBe("income");
    expect(result.merchant).toBe("VA Benefits");
  });

  it("classifies the recurring subscriptions the dashboard reports on", () => {
    expect(categorize("COMCAST / XFINITY", "Phone/Cable").category).toBe(
      "Phone & Internet",
    );
    expect(categorize("SIMPLISAFE", "Other Services").category).toBe("Home & Security");
    expect(categorize("ST MARYS COUNTY METROPOLI", "Utilities").category).toBe(
      "Utilities",
    );
    expect(categorize("Prime Video Channels", "Shopping").merchant).toBe("Prime Video");
    expect(categorize("& Prime Video Channels", "Purchase").merchant).toBe(
      "Prime Video",
    );
  });

  it("files propane as a utility despite the trading name", () => {
    // "TAYLOR GAS HEATING AIR" reads as home services to the bank and to any classifier
    // working from the string alone. It is the propane bill, twice a year.
    const result = categorize("TAYLOR GAS HEATING AIR", "Home Improvement");
    expect(result.category).toBe("Utilities");
    expect(result.merchant).toBe("Taylor Gas");
  });

  it("groups the AI and developer tools that arrive under many names", () => {
    for (const description of ["CLAUDE.AI SUBSCRIPTION", "ANTHROPIC* CLAUDE SUB"]) {
      expect(categorize(description, "Merchandise").merchant).toBe("Anthropic");
    }
    for (const description of ["GROK XAI", "XAI LLC"]) {
      expect(categorize(description, "Merchandise").merchant).toBe("xAI");
    }
    expect(categorize("PAYPAL *GITHUB INC", "Merchandise").category).toBe(
      "Software & AI",
    );
    expect(categorize("PAYPAL *PADDLE.NET35314369001", "Merchandise").merchant).toBe(
      "Paddle.com Market Limited",
    );
    expect(categorize("PP*SPOTIFY*7A3K19B2", "Merchandise").merchant).toBe(
      "Spotify USA Inc",
    );
    expect(categorize("PAYPAL *SPOTIFY USA INC", "Merchandise").merchant).toBe(
      "Spotify USA Inc",
    );
    expect(categorize("CURSOR, AI POWERED IDE", "Merchandise").category).toBe(
      "Software & AI",
    );
  });

  it("reports which rule fired, so a categorisation can be explained", () => {
    expect(categorize("PIZZA HUT 036874", "Dining").ruleId).toBe("pizza-hut");
  });

  it("files an outbound PayPal withdrawal as spend", () => {
    const result = categorize("Withdrawal from PAYPAL to LEE RAULIN INST XFER", "");
    expect(result.flow).toBe("spend");
    expect(result.ruleId).toBe("paypal-outbound");
  });
});

describe("categorize with a commitment's category", () => {
  it("beats a rule that claimed the same merchant", () => {
    // The rule files Pizza Hut under Dining. A user who declared their Pizza commitment as
    // Groceries has said something a pattern cannot know, and said it on purpose.
    const declared = new Map([["Pizza Hut", "Groceries"]]);
    expect(categorize("PIZZA HUT 036874", "Dining", declared).category).toBe(
      "Groceries",
    );
  });

  it("beats the bank's own label where no rule fired", () => {
    const declared = new Map([["VETSOURCE", "Pets"]]);
    expect(categorize("VETSOURCE", "Merchandise", declared).category).toBe("Pets");
  });

  it("is keyed on the merchant a rule resolves to, not the bank's spelling", () => {
    // `WAL-MART #1981` and `WM SUPERCENTER #1981` both resolve to Walmart, which is the
    // string a commitment's matchers hold — so one declaration covers both spellings.
    const declared = new Map([["Walmart", "Groceries"]]);
    expect(categorize("WAL-MART #1981", "Merchandise", declared).category).toBe(
      "Groceries",
    );
    expect(categorize("WM SUPERCENTER #1981", "Merchandise", declared).category).toBe(
      "Groceries",
    );
  });

  it("still reports the rule that fired, which decided the merchant", () => {
    const declared = new Map([["Pizza Hut", "Groceries"]]);
    const result = categorize("PIZZA HUT 036874", "Dining", declared);
    expect(result.ruleId).toBe("pizza-hut");
    expect(result.merchant).toBe("Pizza Hut");
  });

  it("changes nothing for a merchant no commitment claims", () => {
    const declared = new Map([["VETSOURCE", "Pets"]]);
    expect(categorize("PIZZA HUT 036874", "Dining", declared).category).toBe("Dining");
  });
});

describe("CLASSIFY_RULES", () => {
  it("has unique rule ids", () => {
    const ids = CLASSIFY_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
