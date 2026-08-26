import { describe, expect, it } from "vitest";
import { categorize } from "./categorize";

describe("categorize", () => {
  it("collapses both Walmart spellings onto one merchant", () => {
    expect(categorize("WM SUPERCENTER #1981").merchant).toBe("Walmart");
    expect(categorize("WAL-MART #1981").merchant).toBe("Walmart");
  });

  it("names Apple.com/bill Apple and leaves Apple Greene Wine alone", () => {
    expect(categorize("PP*APPLE.COM/BILL").merchant).toBe("Apple");
    expect(categorize("APPLE GREENE WINE AND SPIDUNKIRKMD").merchant).toBe(
      "APPLE GREENE WINE AND SPIDUNKIRKMD",
    );
  });

  it("collapses all three rent payer strings onto one merchant", () => {
    const spellings = [
      "Withdrawal from TURBOTENANT.COM RENT:RAULI",
      "Withdrawal from TurboTenant RENT:RAULI",
      "Withdrawal from RENT:RAULIN RENT:RAULI",
      "Withdrawal from TURBOTENANT RENT:RAULI",
    ];
    for (const spelling of spellings) {
      expect(categorize(spelling).merchant).toBe("Rent");
    }
  });

  it("does not take a Category from the bank's label", () => {
    expect(categorize("SOME UNKNOWN CAFE").flow).toBeNull();
    expect(categorize("MYSTERY STORE").merchant).toBe("MYSTERY STORE");
  });

  it("files named flows from the merchant string", () => {
    expect(categorize("INTEREST CHARGE PURCHASE").flow).toBe("interest_fee");
    expect(categorize("MONTHLY INTEREST PAID").merchant).toBe("Interest Paid");
    expect(categorize("MONTHLY INTEREST PAID").flow).toBe("interest_fee");
    expect(categorize("VACP TREAS 310").flow).toBe("income");
    expect(categorize("VACP TREAS 310").merchant).toBe("VA Benefits");
    expect(categorize("PAYPAL TO LEE RAULIN").flow).toBe("spend");
  });
});
